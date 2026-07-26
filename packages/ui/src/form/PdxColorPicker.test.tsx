import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import PdxColorPicker from './PdxColorPicker';

function ColorHarness({
  initialValue = '#2F6FED',
  onChange,
  showTextInput,
}: {
  initialValue?: string;
  onChange?: (value: string) => void;
  showTextInput?: boolean;
}) {
  const [value, setValue] = useState(initialValue);

  return (
    <PdxColorPicker
      label="Theme colour"
      onChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
      showTextInput={showTextInput}
      value={value}
    />
  );
}

const openChannels = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: /Adjust colour/ }));
  return screen.findByRole('slider', { name: 'Hue' });
};

describe('PdxColorPicker', () => {
  it('accepts a hex value typed into the field', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<ColorHarness onChange={onChange} />);

    const field = screen.getByRole('textbox', { name: 'Theme colour' });
    await user.clear(field);
    await user.type(field, '#1A2B3C');

    expect(onChange).toHaveBeenLastCalledWith('#1A2B3C');
  });

  it('exposes each colour channel as a bounded slider the keyboard can reach', async () => {
    const user = userEvent.setup();
    render(<ColorHarness />);

    const hue = await openChannels(user);

    expect(hue).toHaveAttribute('min', '0');
    expect(hue).toHaveAttribute('max', '360');
    expect(hue).toHaveAccessibleName('Hue');

    const saturation = screen.getByRole('slider', { name: 'Saturation' });
    const lightness = screen.getByRole('slider', { name: 'Lightness' });
    expect(saturation).toHaveAttribute('max', '100');
    expect(lightness).toHaveAttribute('max', '100');

    hue.focus();
    await user.tab();
    expect(saturation).toHaveFocus();
    await user.tab();
    expect(lightness).toHaveFocus();
  });

  it('publishes a new colour whenever a channel moves', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<ColorHarness onChange={onChange} />);

    await openChannels(user);
    const lightness = screen.getByRole('slider', { name: 'Lightness' });

    fireEvent.change(lightness, { target: { value: '0' } });
    expect(onChange).toHaveBeenLastCalledWith('#000000');

    fireEvent.change(lightness, { target: { value: '100' } });
    expect(onChange).toHaveBeenLastCalledWith('#FFFFFF');

    fireEvent.change(screen.getByRole('slider', { name: 'Hue' }), {
      target: { value: '120' },
    });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.stringMatching(/^#[0-9A-F]{6}$/)
    );
  });

  it('keeps a channel steady while its own slider is the one moving', async () => {
    const user = userEvent.setup();
    render(<ColorHarness initialValue="#808080" />);

    await openChannels(user);
    const hue = screen.getByRole('slider', { name: 'Hue' });

    fireEvent.change(hue, { target: { value: '200' } });
    expect(hue).toHaveValue('200');

    fireEvent.change(screen.getByRole('slider', { name: 'Lightness' }), {
      target: { value: '10' },
    });
    expect(hue).toHaveValue('200');
  });

  it('closes the channel panel on Escape and returns focus to its toggle', async () => {
    const user = userEvent.setup();
    render(<ColorHarness />);

    const toggle = screen.getByRole('button', { name: /Adjust colour/ });
    await openChannels(user);

    await user.keyboard('{Escape}');
    await waitFor(() =>
      expect(
        screen.queryByRole('slider', { name: 'Hue' })
      ).not.toBeInTheDocument()
    );
    await waitFor(() => expect(toggle).toHaveFocus());
  });

  it('announces the current colour on the toggle without a text field', () => {
    render(<ColorHarness showTextInput={false} />);

    expect(
      screen.getByRole('button', { name: /Adjust colour/ })
    ).toHaveAccessibleName('Adjust colour channels, #2F6FED selected');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });
});
