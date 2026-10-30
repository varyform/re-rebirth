// A real <input> (or <textarea>) over a box the canvas draws: canvas UI can't
// take text (no touch keyboard, paste or IME). Drawing code says where the box
// is in rack units; `place` maps that onto the page after each render.
// multiline: a textarea. autofocus: take the keyboard when it appears (desktop).
export function canvasInput(canvas, { placeholder = '', onInput, multiline = false, autofocus = true }) {
  const input = Object.assign(document.createElement(multiline ? 'textarea' : 'input'), {
    className: multiline ? 'canvas-input multiline' : 'canvas-input',
    placeholder,
    spellcheck: false,
    autocomplete: 'off',
    hidden: true,
  });
  if (!multiline) input.type = autofocus ? 'search' : 'text';
  input.addEventListener('input', () => onInput(input.value));
  document.body.append(input);

  return {
    input,
    // rect: { x, y, w, h, size } in rack units, or null to hide. rackW: rack width in units.
    place(rect, rackW, value) {
      if (!rect) {
        if (!input.hidden) {
          input.blur();
          input.hidden = true;
        }
        return;
      }
      const r = canvas.getBoundingClientRect();
      const k = r.width / rackW;
      Object.assign(input.style, {
        left: `${r.left + window.scrollX + rect.x * k}px`,
        top: `${r.top + window.scrollY + rect.y * k}px`,
        width: `${rect.w * k}px`,
        height: `${rect.h * k}px`,
        fontSize: `${rect.size * k}px`,
      });
      if (input.value !== value) input.value = value;
      if (input.hidden) {
        input.hidden = false;
        // Desktop: type straight away. Touch screens only show a keyboard on a tap.
        if (autofocus && !matchMedia('(pointer: coarse)').matches) input.focus();
      }
    },
  };
}
