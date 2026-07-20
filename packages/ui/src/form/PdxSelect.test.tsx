import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import PdxSelect from './PdxSelect';

describe('PdxSelect', () => {
  it('opens a styled listbox and reports the selected option', async () => {
    const onValueChange = vi.fn();
    const user = userEvent.setup();

    render(
      <PdxSelect
        label="Framework"
        options={[
          { label: 'React/Vite', value: 'react-vite' },
          { label: 'Vue/Vite', value: 'vue-vite' },
        ]}
        value="react-vite"
        onValueChange={onValueChange}
      />
    );

    await user.click(screen.getByRole('combobox', { name: 'Framework' }));
    expect(screen.getByRole('listbox')).toBeVisible();

    await user.click(screen.getByRole('option', { name: 'Vue/Vite' }));
    expect(onValueChange).toHaveBeenCalledWith('vue-vite', {
      label: 'Vue/Vite',
      value: 'vue-vite',
    });
  });

  it('supports keyboard selection and disabled options', async () => {
    const onValueChange = vi.fn();
    const user = userEvent.setup();

    render(
      <PdxSelect
        aria-label="Runner"
        options={[
          { label: 'Browser', value: 'browser' },
          { label: 'Remote', value: 'remote', disabled: true },
        ]}
        value="browser"
        onValueChange={onValueChange}
      />
    );

    const trigger = screen.getByRole('combobox', { name: 'Runner' });
    trigger.focus();
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}');

    expect(onValueChange).not.toHaveBeenCalledWith('remote', expect.anything());
  });

  it('keeps the placeholder state controlled until a selection is made', async () => {
    const user = userEvent.setup();

    render(
      <PdxSelect
        aria-label="Target"
        options={[{ label: 'Desktop', value: 'desktop' }]}
        placeholder="Choose target"
      />
    );

    const trigger = screen.getByRole('combobox', { name: 'Target' });
    expect(trigger.textContent).toContain('Choose target');

    await user.click(trigger);
    await user.click(screen.getByRole('option', { name: 'Desktop' }));
    expect(trigger.textContent).toContain('Desktop');
  });
});
