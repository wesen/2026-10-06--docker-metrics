// Package hub fans out dashboard frames and events to WebSocket clients.
package hub

import (
	"context"
	"encoding/json"
	"log/slog"
	"sync"
	"time"

	"github.com/coder/websocket"
)

// Frame is the wire shape published to a topic.
type Frame struct {
	Type    string         `json:"type"`
	Topic   string         `json:"topic,omitempty"`
	T       int64          `json:"t,omitempty"`
	Data    map[string]any `json:"data,omitempty"`
	Value   any            `json:"value,omitempty"`
	Kind    string         `json:"kind,omitempty"`
	Text    string         `json:"text,omitempty"`
	Run     string         `json:"run,omitempty"`
	Level   string         `json:"level,omitempty"`
	Status  string         `json:"status,omitempty"`
	Message string         `json:"message,omitempty"`
	Rule    string         `json:"rule,omitempty"`
	Overflow bool          `json:"overflow,omitempty"`
}

const (
	outboundBuffer = 256
	writeTimeout   = 10 * time.Second
)

// Hub tracks subscribers per topic.
type Hub struct {
	mu     sync.RWMutex
	topics map[string]map[*Client]struct{}
	log    *slog.Logger
}

// New creates a hub.
func New(log *slog.Logger) *Hub {
	if log == nil {
		log = slog.Default()
	}
	return &Hub{topics: map[string]map[*Client]struct{}{}, log: log}
}

// Subscribe adds a client to a topic.
func (h *Hub) Subscribe(c *Client, topic string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	set := h.topics[topic]
	if set == nil {
		set = map[*Client]struct{}{}
		h.topics[topic] = set
	}
	set[c] = struct{}{}
}

// Unsubscribe removes a client from a topic.
func (h *Hub) Unsubscribe(c *Client, topic string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if set := h.topics[topic]; set != nil {
		delete(set, c)
		if len(set) == 0 {
			delete(h.topics, topic)
		}
	}
}

// UnsubscribeAll removes a client from every topic.
func (h *Hub) UnsubscribeAll(c *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for topic, set := range h.topics {
		delete(set, c)
		if len(set) == 0 {
			delete(h.topics, topic)
		}
	}
}

// SubscriberCount reports how many clients listen to a topic.
func (h *Hub) SubscriberCount(topic string) int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.topics[topic])
}

// TopicCount reports the number of distinct topics with subscribers.
func (h *Hub) TopicCount() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.topics)
}

// Publish sends a frame to every subscriber of topic. Slow clients have their
// oldest buffered frames dropped rather than blocking the producer.
func (h *Hub) Publish(topic string, frame Frame) {
	frame.Type = "frame"
	frame.Topic = topic
	data, err := json.Marshal(frame)
	if err != nil {
		h.log.Warn("publish marshal failed", "topic", topic, "err", err)
		return
	}
	h.mu.RLock()
	set := h.topics[topic]
	clients := make([]*Client, 0, len(set))
	for c := range set {
		clients = append(clients, c)
	}
	h.mu.RUnlock()
	for _, c := range clients {
		c.enqueue(data)
	}
}

// Broadcast publishes a frame to every topic's subscribers.
func (h *Hub) Broadcast(frame Frame) {
	h.mu.RLock()
	topics := make([]string, 0, len(h.topics))
	for t := range h.topics {
		topics = append(topics, t)
	}
	h.mu.RUnlock()
	for _, t := range topics {
		h.Publish(t, frame)
	}
}

// Event publishes a daemon/rule event to the events topic.
func (h *Hub) Event(kind, container, rule string, at int64) {
	h.Publish("events", Frame{Type: "event", Kind: kind, Rule: rule,
		Data: map[string]any{"container": container, "at": at}})
}

// Client is one WebSocket connection.
type Client struct {
	hub    *Hub
	conn   *websocket.Conn
	send   chan []byte
	log    *slog.Logger
	ctx    context.Context
	cancel context.CancelFunc
	topics map[string]struct{}
	mu     sync.Mutex
}

// NewClient wraps an accepted WebSocket connection.
func (h *Hub) NewClient(ctx context.Context, conn *websocket.Conn) *Client {
	cctx, cancel := context.WithCancel(ctx)
	return &Client{
		hub:    h,
		conn:   conn,
		send:   make(chan []byte, outboundBuffer),
		log:    h.log,
		ctx:    cctx,
		cancel: cancel,
		topics: map[string]struct{}{},
	}
}

func (c *Client) enqueue(msg []byte) {
	select {
	case c.send <- msg:
	default:
		// Drop the oldest frame to keep the newest data flowing.
		select {
		case <-c.send:
		default:
		}
		select {
		case c.send <- msg:
		default:
		}
	}
}

// Send marshals and enqueues a direct frame to this client only.
func (c *Client) Send(frame Frame) {
	data, err := json.Marshal(frame)
	if err != nil {
		return
	}
	c.enqueue(data)
}

// Run starts the read and write pumps and returns when the connection closes.
func (c *Client) Run() {
	defer c.Close()
	go c.writePump()
	c.readPump()
}

func (c *Client) writePump() {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-c.ctx.Done():
			return
		case msg, ok := <-c.send:
			if !ok {
				return
			}
			wctx, cancel := context.WithTimeout(c.ctx, writeTimeout)
			err := c.conn.Write(wctx, websocket.MessageText, msg)
			cancel()
			if err != nil {
				return
			}
		case <-ticker.C:
			pctx, cancel := context.WithTimeout(c.ctx, writeTimeout)
			err := c.conn.Ping(pctx)
			cancel()
			if err != nil {
				return
			}
		}
	}
}

func (c *Client) readPump() {
	c.Send(Frame{Type: "hello", T: time.Now().Unix()})
	for {
		typ, data, err := c.conn.Read(c.ctx)
		if err != nil {
			return
		}
		if typ != websocket.MessageText {
			continue
		}
		var msg struct {
			Type  string `json:"type"`
			Topic string `json:"topic"`
		}
		if err := json.Unmarshal(data, &msg); err != nil {
			continue
		}
		switch msg.Type {
		case "subscribe":
			if msg.Topic == "" {
				continue
			}
			c.hub.Subscribe(c, msg.Topic)
			c.mu.Lock()
			c.topics[msg.Topic] = struct{}{}
			c.mu.Unlock()
			c.Send(Frame{Type: "subscribed", Topic: msg.Topic})
		case "unsubscribe":
			c.hub.Unsubscribe(c, msg.Topic)
			c.mu.Lock()
			delete(c.topics, msg.Topic)
			c.mu.Unlock()
		case "ping":
			c.Send(Frame{Type: "pong"})
		}
	}
}

// Close cancels the client and detaches it from all topics.
func (c *Client) Close() {
	c.cancel()
	c.hub.UnsubscribeAll(c)
	_ = c.conn.Close(websocket.StatusNormalClosure, "")
}
