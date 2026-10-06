// @group Basics
// @title Container metadata
// @desc inspect(): image, state, restarts, labels

const d = docker();
console.table(
  d.containers((s) => true).names().map((n) => {
    const i = d.container(n).inspect();
    return {
      name: n,
      image: i.image,
      state: i.state,
      restarts: i.restarts,
      project: i.labels["com.docker.compose.project"] || "—",
      service: i.labels["com.docker.compose.service"] || "—",
    };
  })
);
