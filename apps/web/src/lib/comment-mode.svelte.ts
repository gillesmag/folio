// Comment mode is switched from the app header but belongs to the document page,
// so the two share this one flag instead of passing it through the layout.
// Whether the toggle is offered at all follows the route, so server and client
// render the same header. Comments are hidden by default on every document.
export const commentMode = $state({ open: false });
