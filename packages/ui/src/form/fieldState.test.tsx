import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import PdxTreeSelect from '../data/PdxTreeSelect';
import PdxVerificationCode from './PdxVerificationCode';
import PdxRegexInput from './PdxRegexInput';
import PdxFileUpload from './PdxFileUpload';
import PdxImageUpload from './PdxImageUpload';

describe('field state boundaries', () => {
  it('associates generated TreeSelect labels with distinct controls', async () => {
    const user = userEvent.setup();
    const change = vi.fn();
    render(
      <>
        <PdxTreeSelect
          label="Category"
          options={[{ id: 'first', label: 'First' }]}
          onChange={change}
        />
        <PdxTreeSelect label="Other" options={[]} />
      </>
    );
    expect(screen.getByLabelText('Category')).toBe(
      screen.getByRole('combobox', { name: 'Category' })
    );
    await user.selectOptions(screen.getByLabelText('Category'), 'first');
    expect(change).toHaveBeenCalledWith('first', {
      id: 'first',
      label: 'First',
    });
    expect(screen.getByLabelText('Other')).not.toBe(
      screen.getByLabelText('Category')
    );
  });

  it.each([false, true])(
    'preserves OTP interior positions with controlled=%s',
    async (controlled) => {
      const user = userEvent.setup();
      const complete = vi.fn();
      const change = vi.fn();
      function Code() {
        const [value, setValue] = useState('123456');
        return (
          <PdxVerificationCode
            label="Code"
            {...(controlled ? { value } : { defaultValue: value })}
            onChange={(next) => {
              change(next);
              setValue(next);
            }}
            onComplete={complete}
          />
        );
      }
      render(<Code />);
      await user.clear(screen.getByLabelText('Code digit 3 of 6'));
      expect(change).toHaveBeenLastCalledWith('12 456');
      expect(screen.getByLabelText('Code digit 3 of 6')).toHaveValue('');
      expect(screen.getByLabelText('Code digit 4 of 6')).toHaveValue('4');
      expect(complete).not.toHaveBeenCalled();
      await user.type(screen.getByLabelText('Code digit 3 of 6'), '9');
      expect(complete).toHaveBeenCalledWith('129456');
    }
  );

  it('preserves pasted partial code positions without completing a code with a hole', async () => {
    const user = userEvent.setup();
    const complete = vi.fn();
    render(<PdxVerificationCode label="Code" onComplete={complete} />);
    screen.getByLabelText('Code digit 1 of 6').focus();
    await user.paste('12 456');
    expect(screen.getByLabelText('Code digit 3 of 6')).toHaveValue('');
    expect(screen.getByLabelText('Code digit 4 of 6')).toHaveValue('4');
    expect(complete).not.toHaveBeenCalled();
  });

  it('restarts sticky regex validation for each render without mutating the caller pattern', () => {
    const pattern = /a/y;
    pattern.lastIndex = 7;
    const props = {
      pattern,
      value: 'a',
      validMessage: 'Valid',
      invalidMessage: 'Invalid',
    };
    const { rerender } = render(<PdxRegexInput {...props} />);
    for (let index = 0; index < 3; index += 1) {
      rerender(<PdxRegexInput {...props} description={`Pass ${index}`} />);
      expect(screen.getByText('Valid')).toBeVisible();
      expect(screen.queryByText('Invalid')).not.toBeInTheDocument();
    }
    expect(pattern.lastIndex).toBe(7);
  });

  it.each(['file', 'image'] as const)(
    'validates required %s upload against the selected files',
    async (kind) => {
      const user = userEvent.setup();
      const submit = vi.fn();
      const file = new File(['image'], 'sample.png', { type: 'image/png' });
      render(
        <form
          aria-label="Upload form"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          {kind === 'file' ? (
            <PdxFileUpload label="Attachment" required />
          ) : (
            <PdxImageUpload label="Attachment" required />
          )}
          <button type="submit">Submit</button>
        </form>
      );
      await user.click(screen.getByRole('button', { name: 'Submit' }));
      expect(submit).not.toHaveBeenCalled();
      await user.upload(screen.getByLabelText('Attachment'), file);
      await user.click(screen.getByRole('button', { name: 'Submit' }));
      expect(submit).toHaveBeenCalledOnce();
      await user.click(
        await screen.findByRole('button', { name: 'Remove sample.png' })
      );
      await user.click(screen.getByRole('button', { name: 'Submit' }));
      expect(submit).toHaveBeenCalledOnce();
      await user.upload(screen.getByLabelText('Attachment'), file);
      await user.click(screen.getByRole('button', { name: 'Submit' }));
      expect(submit).toHaveBeenCalledTimes(2);
    }
  );
});
