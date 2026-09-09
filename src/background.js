const api = globalThis.browser ?? globalThis.chrome;

if (api.sidePanel?.setPanelBehavior) {
  api.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
} else if (api.action?.onClicked && api.sidebarAction?.toggle) {
  api.action.onClicked.addListener(() => api.sidebarAction.toggle());
}
