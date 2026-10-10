// A real <input> over a box the canvas draws: canvas UI can't take text (no
// touch keyboard, paste or IME). Drawing code says where the box is in rack
// units; `place` maps that onto the page after each render.
export function canvasInput(canvas, { placeholder, onInput }) {
  const input = Object.assign(document.createElement('input'), {
    type: 'search',
    className: 'canvas-input',
    placeholder,
    spellcheck: false,
    autocomplete: 'off',
    hidden: true,
  });
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
        if (!matchMedia('(pointer: coarse)').matches) input.focus();
      }
    },
  };
}
