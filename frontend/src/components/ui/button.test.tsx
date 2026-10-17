import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Button } from './button';

describe('Button', () => {
  it('asChild renders the child element with button styling and no <button>', () => {
    const { container } = render(
      <Button asChild>
        <a href="/x">Go</a>
      </Button>,
    );
    expect(screen.getByRole('link')).toHaveClass('inline-flex');
    expect(container.querySelector('button')).toBeNull();
  });

  it('asChild keeps the child className and passes extra props through', () => {
    render(
      <Button asChild variant="outline" className="extra" aria-label="Edit item">
        <a href="/x" className="own">
          Edit
        </a>
      </Button>,
    );
    const link = screen.getByRole('link', { name: 'Edit item' });
    expect(link).toHaveClass('inline-flex', 'border', 'extra', 'own');
    expect(link).toHaveAttribute('href', '/x');
  });

  it('renders a <button> by default', () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole('button', { name: 'Save' })).toHaveClass('inline-flex');
  });
});
