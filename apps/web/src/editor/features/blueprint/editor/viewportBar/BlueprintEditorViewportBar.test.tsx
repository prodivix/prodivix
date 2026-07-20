import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { BlueprintEditorViewportBar } from './BlueprintEditorViewportBar';

const createProps = () => ({
  canvasMode: 'design' as const,
  onCanvasModeChange: vi.fn(),
  runProvider: 'browser' as const,
  remoteAvailable: false,
  onRunProviderChange: vi.fn(),
  runTarget: 'react-vite' as const,
  onRunTargetChange: vi.fn(),
  viewportWidth: '1440',
  viewportHeight: '900',
  onViewportWidthChange: vi.fn(),
  onViewportHeightChange: vi.fn(),
  zoom: 100,
  zoomStep: 5,
  onZoomChange: vi.fn(),
  onResetView: vi.fn(),
});

describe('BlueprintEditorViewportBar run configuration', () => {
  it('keeps runtime and framework controls out of the no-code design state', () => {
    render(<BlueprintEditorViewportBar {...createProps()} />);

    expect(
      screen.queryByRole('button', { name: 'viewport.runConfiguration' })
    ).toBeNull();
    expect(
      screen.queryByRole('combobox', { name: 'viewport.runProvider.label' })
    ).toBeNull();
    expect(
      screen.queryByRole('combobox', { name: 'viewport.runTarget.label' })
    ).toBeNull();
  });

  it('reveals styled runtime controls only from run mode', async () => {
    const user = userEvent.setup();
    const props = createProps();

    render(<BlueprintEditorViewportBar {...props} canvasMode="run" />);

    await user.click(
      screen.getByRole('button', { name: 'viewport.runConfiguration' })
    );

    expect(
      screen.getByRole('combobox', { name: 'viewport.runProvider.label' })
    ).toBeTruthy();
    const target = screen.getByRole('combobox', {
      name: 'viewport.runTarget.label',
    });
    expect(target).toBeTruthy();

    await user.click(target);
    await user.click(
      screen.getByRole('option', { name: 'viewport.runTarget.vue' })
    );
    expect(props.onRunTargetChange).toHaveBeenCalledWith('vue-vite');
  });
});
