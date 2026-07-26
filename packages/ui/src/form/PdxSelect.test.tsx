import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import PdxSelect from './PdxSelect';

const frameworks = [
  { label: 'React/Vite', value: 'react-vite' },
  { label: 'Vue/Vite', value: 'vue-vite' },
  { label: 'Svelte/Vite', value: 'svelte-vite' },
];

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

  it('filters the options as the user types and selects the match', async () => {
    const onValueChange = vi.fn();
    const user = userEvent.setup();

    render(
      <PdxSelect
        aria-label="Framework"
        onValueChange={onValueChange}
        options={frameworks}
        value="react-vite"
      />
    );

    const trigger = screen.getByRole('combobox', { name: 'Framework' });
    trigger.focus();

    await user.keyboard('vu');
    expect(await screen.findByRole('listbox')).toBeVisible();
    expect(screen.getAllByRole('option')).toHaveLength(1);

    await user.keyboard('{Enter}');
    expect(onValueChange).toHaveBeenLastCalledWith('vue-vite', {
      label: 'Vue/Vite',
      value: 'vue-vite',
    });
  });

  it('widens the filter again on Backspace and reports how many options match', async () => {
    const user = userEvent.setup();

    render(
      <PdxSelect
        aria-label="Framework"
        options={frameworks}
        value="react-vite"
      />
    );

    screen.getByRole('combobox', { name: 'Framework' }).focus();
    await user.keyboard('sv');
    expect(await screen.findByRole('listbox')).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent('1 of 3 options');

    await user.keyboard('{Backspace}{Backspace}');
    expect(screen.getAllByRole('option')).toHaveLength(3);
    expect(screen.getByRole('status')).toHaveTextContent('3 of 3 options');
  });

  it('says so when the filter matches nothing', async () => {
    const onValueChange = vi.fn();
    const user = userEvent.setup();

    render(
      <PdxSelect
        aria-label="Framework"
        onValueChange={onValueChange}
        options={frameworks}
      />
    );

    screen.getByRole('combobox', { name: 'Framework' }).focus();
    await user.keyboard('zzz');

    expect(
      await screen.findByRole('option', { name: 'No matching options' })
    ).toBeVisible();

    await user.keyboard('{Enter}');
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('moves to the ends of the list with Home and End', async () => {
    const onValueChange = vi.fn();
    const user = userEvent.setup();

    render(
      <PdxSelect
        aria-label="Framework"
        onValueChange={onValueChange}
        options={frameworks}
        value="vue-vite"
      />
    );

    screen.getByRole('combobox', { name: 'Framework' }).focus();
    await user.keyboard('{ArrowDown}{End}{Enter}');
    expect(onValueChange).toHaveBeenLastCalledWith('svelte-vite', {
      label: 'Svelte/Vite',
      value: 'svelte-vite',
    });

    await user.keyboard('{ArrowDown}{Home}{Enter}');
    expect(onValueChange).toHaveBeenLastCalledWith('react-vite', {
      label: 'React/Vite',
      value: 'react-vite',
    });
  });

  it('closes on Escape without changing the value', async () => {
    const onValueChange = vi.fn();
    const user = userEvent.setup();

    render(
      <PdxSelect
        aria-label="Framework"
        onValueChange={onValueChange}
        options={frameworks}
        value="react-vite"
      />
    );

    const trigger = screen.getByRole('combobox', { name: 'Framework' });
    trigger.focus();
    await user.keyboard('{ArrowDown}');
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    await user.keyboard('{Escape}');
    await waitFor(() =>
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    );
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('does not open when disabled', async () => {
    const user = userEvent.setup();

    render(<PdxSelect aria-label="Framework" disabled options={frameworks} />);

    const trigger = screen.getByRole('combobox', { name: 'Framework' });
    expect(trigger).toBeDisabled();

    await user.click(trigger);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});
