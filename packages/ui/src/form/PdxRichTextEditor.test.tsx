import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PdxRichTextEditor from './PdxRichTextEditor';

describe('PdxRichTextEditor', () => {
  it('removes executable markup from controlled values', async () => {
    render(
      <PdxRichTextEditor
        value={
          '<p onclick="alert(1)">Safe<img src=x onerror="alert(2)"></p><script>alert(3)</script><a href="javascript:alert(4)">Link</a>'
        }
      />
    );

    const editor = screen.getByRole('textbox');
    await waitFor(() => expect(editor).toHaveTextContent('SafeLink'));
    expect(editor.innerHTML).toBe('<p>Safe</p><a>Link</a>');
    expect(editor.querySelector('[onclick],[onerror],script,img')).toBeNull();
  });

  it('sanitizes pasted HTML even without execCommand support', () => {
    const onChange = vi.fn();
    render(<PdxRichTextEditor onChange={onChange} />);
    const editor = screen.getByRole('textbox');

    fireEvent.paste(editor, {
      clipboardData: {
        getData: (type: string) =>
          type === 'text/html'
            ? '<strong onclick="alert(1)">Safe</strong><script>alert(2)</script>'
            : 'Safe',
      },
    });

    expect(editor.innerHTML).toBe('<strong>Safe</strong>');
    expect(onChange).toHaveBeenLastCalledWith('<strong>Safe</strong>');
  });
});
