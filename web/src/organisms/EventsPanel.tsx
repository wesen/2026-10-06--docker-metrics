import { useAppSelector } from "../app/store";
import { EventRow } from "../molecules/EventRow";

export function EventsPanel() {
  const events = useAppSelector((s) => s.stream.events);
  if (events.length === 0) {
    return (
      <div className="scroll">
        <div className="empty">
          <b>No events.</b> Rules firing, restarts and emitted events appear here.
        </div>
      </div>
    );
  }
  return (
    <div className="scroll events">
      {events.map((e, i) => (
        <EventRow key={e.t + "-" + i + "-" + e.type} e={e} />
      ))}
    </div>
  );
}
