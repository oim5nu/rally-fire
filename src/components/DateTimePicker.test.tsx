// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import DateTimePicker from './DateTimePicker';

afterEach(cleanup);

describe('DateTimePicker', () => {
  it('renders an accessible group with required date and time controls', () => {
    render(<DateTimePicker name="startsAt" label="Season starts" required />);

    expect(screen.getByRole('group', { name: 'Season starts' })).toBeInTheDocument();
    expect(screen.getByLabelText('Date')).toBeRequired();
    expect(screen.getByLabelText('Time')).toBeRequired();
  });

  it('combines date and time into the named form value', () => {
    const { container } = render(
      <DateTimePicker name="startsAt" label="Season starts" required />,
    );

    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-07-01' } });
    fireEvent.change(screen.getByLabelText('Time'), { target: { value: '18:30' } });

    expect(container.querySelector('input[name="startsAt"]')).toHaveValue(
      '2026-07-01T18:30',
    );
  });
});
