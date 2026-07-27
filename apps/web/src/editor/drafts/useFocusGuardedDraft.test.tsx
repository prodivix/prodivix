import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useFocusGuardedDraft } from './useFocusGuardedDraft';

function GuardedField({ source }: { source: string }) {
  const [draft, setDraft] = useState(source);
  const editing = useFocusGuardedDraft(source, setDraft);
  return (
    <input
      aria-label="draft"
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onFocus={editing.beginEditing}
      onBlur={editing.endEditing}
    />
  );
}

const field = () => screen.getByLabelText('draft') as HTMLInputElement;

describe('useFocusGuardedDraft', () => {
  it('adopts a changed source while the control is untouched', () => {
    const view = render(<GuardedField source="first" />);
    expect(field().value).toBe('first');

    view.rerender(<GuardedField source="second" />);
    expect(field().value).toBe('second');
  });

  it('keeps uncommitted input while the control is focused', () => {
    const view = render(<GuardedField source="first" />);

    fireEvent.focus(field());
    fireEvent.change(field(), { target: { value: 'typed by the author' } });
    view.rerender(<GuardedField source="second" />);

    expect(field().value).toBe('typed by the author');
  });

  it('adopts again once the control is released', () => {
    const view = render(<GuardedField source="first" />);

    fireEvent.focus(field());
    fireEvent.change(field(), { target: { value: 'typed by the author' } });
    fireEvent.blur(field());
    view.rerender(<GuardedField source="third" />);

    expect(field().value).toBe('third');
  });
});
