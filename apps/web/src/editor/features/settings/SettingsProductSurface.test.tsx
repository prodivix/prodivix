import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GlobalSettingsContent } from './GlobalSettingsContent';
import { ProjectSettingsContent } from './ProjectSettingsContent';
import { resetSettingsStore } from '@/test-utils/editorStore';

describe('settings product surface', () => {
  beforeEach(() => resetSettingsStore());

  it('renders only server-backed project settings', () => {
    render(<ProjectSettingsContent />);

    expect(
      screen.getByText('settings.project.panels.collaboration.title')
    ).toBeTruthy();
  });

  it('renders the current global settings surface', () => {
    render(<GlobalSettingsContent />);

    expect(
      screen.getByText('settings.global.rows.language.label')
    ).toBeTruthy();
    expect(
      screen.getByText('settings.global.rows.defaultFramework.label')
    ).toBeTruthy();
  });
});
