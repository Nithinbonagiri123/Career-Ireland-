import { describe, expect, it } from 'vitest';
import { describeContactEvent, joinNames } from './contact-activity';

describe('employer contact Activity lines', () => {
  it('names the contact and who they replaced as primary', () => {
    expect(
      describeContactEvent(
        'CREATED',
        null,
        { fullName: 'Bob Smith', isPrimary: true },
        { replacedPrimary: [{ id: 'a', fullName: 'Alice Primary' }] },
      ),
    ).toBe('Bob Smith added as primary contact (replaced Alice Primary)');
  });

  it('plain add, first primary, demotion, unticking, rename, delete', () => {
    expect(describeContactEvent('CREATED', null, { fullName: 'Cara', isPrimary: false }, {})).toBe(
      'Cara added as a contact',
    );
    expect(describeContactEvent('CREATED', null, { fullName: 'Cara', isPrimary: true }, {})).toBe(
      'Cara added as primary contact',
    );
    expect(
      describeContactEvent(
        'UPDATED',
        { fullName: 'Alice Primary', isPrimary: true },
        { fullName: 'Alice Primary', isPrimary: false },
        { via: 'primary_contact_change', replacedBy: { fullName: 'Bob Smith' } },
      ),
    ).toBe('Alice Primary is no longer the primary contact (replaced by Bob Smith)');
    expect(
      describeContactEvent(
        'UPDATED',
        { fullName: 'Bob', isPrimary: false },
        { fullName: 'Bob', isPrimary: true },
        { replacedPrimary: ['Alice', 'Ann'] },
      ),
    ).toBe('Bob made primary contact (replaced Alice and Ann)');
    expect(
      describeContactEvent(
        'UPDATED',
        { fullName: 'Bob', isPrimary: true },
        { fullName: 'Bob', isPrimary: false },
        {},
      ),
    ).toBe('Bob is no longer the primary contact — no primary contact now');
    expect(
      describeContactEvent(
        'UPDATED',
        { fullName: 'Bob', isPrimary: false },
        { fullName: 'Robert', isPrimary: false },
        {},
      ),
    ).toBe('Bob renamed to Robert');
    expect(
      describeContactEvent(
        'UPDATED',
        { fullName: 'Bob', isPrimary: false },
        { fullName: 'Bob', isPrimary: false },
        {},
      ),
    ).toBe("Bob's contact details updated");
    expect(
      describeContactEvent('DELETED', { fullName: 'Alice', isPrimary: true }, null, {
        leftWithoutPrimary: true,
      }),
    ).toBe('Alice (primary contact) removed — no primary contact now');
    expect(describeContactEvent('DELETED', { fullName: 'Dan', isPrimary: false }, null, null)).toBe(
      'Dan removed from contacts',
    );
  });

  it('older audit rows without names still read sensibly', () => {
    expect(describeContactEvent('CREATED', null, null, null)).toBe('Contact added');
    expect(
      describeContactEvent(
        'UPDATED',
        { fullName: 'Alice', isPrimary: true },
        { fullName: 'Alice', isPrimary: false },
        { via: 'primary_contact_change' },
      ),
    ).toBe('Alice is no longer the primary contact');
  });

  it('joins names in plain English', () => {
    expect(joinNames([])).toBe('');
    expect(joinNames(['A'])).toBe('A');
    expect(joinNames(['A', 'B', 'C'])).toBe('A, B and C');
  });
});
