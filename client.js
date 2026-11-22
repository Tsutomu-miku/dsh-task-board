window.__ModuleLoader__.load({
  id: "dsh-task-board",
  factory(require) {
    const { createElement } = require("react")
    const panelId = "task-board"

    function BoardPanel() {
      return createElement("iframe", {
        title: "任务看板",
        src: new URL("api/dsh-task-board/board.html", document.baseURI).href,
        style: { display: "block", width: "100%", height: "100%", minHeight: "70vh", border: 0 },
      })
    }

    function BoardIcon({ size = 18 }) {
      return createElement("svg", {
        width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor",
        strokeWidth: 1.8, strokeLinecap: "round", "aria-hidden": true,
      }, createElement("rect", { x: 3, y: 4, width: 18, height: 16, rx: 2 }),
      createElement("path", { d: "M9 4v16M15 4v16" }))
    }

    return {
      inject: ["slots"],
      apply(ctx) {
        ctx.slots.inject("main", () => ctx.slots.register({ name: "main", key: panelId }, BoardPanel))
        ctx.slots.inject("sidebar.panellist", () => ctx.slots.register({
          name: "sidebar.panellist", id: panelId, order: 30,
          label: "任务看板",
        }, BoardIcon))
      },
    }
  },
})
