import { isTransitionAllowed, canRoleTransition, slaHoursFor, ALL_STATUSES } from '../src/services/workflow';

describe('workflow pure helpers', () => {
  describe('isTransitionAllowed', () => {
    it('allows the canonical happy path', () => {
      const path = [
        ['DRAFT', 'SUBMITTED'],
        ['SUBMITTED', 'VALIDATING'],
        ['VALIDATING', 'PENDING_APPROVAL'],
        ['PENDING_APPROVAL', 'APPROVED'],
        ['APPROVED', 'ASSIGNED'],
        ['ASSIGNED', 'IN_PROGRESS'],
        ['IN_PROGRESS', 'COMPLETED'],
        ['COMPLETED', 'VERIFIED'],
        ['VERIFIED', 'CLOSED'],
      ];
      for (const [from, to] of path) {
        expect(isTransitionAllowed(from, to)).toBe(true);
      }
    });

    it('rejects illegal jumps', () => {
      expect(isTransitionAllowed('DRAFT', 'APPROVED')).toBe(false);
      expect(isTransitionAllowed('DRAFT', 'CLOSED')).toBe(false);
      expect(isTransitionAllowed('CLOSED', 'DRAFT')).toBe(false); // terminal
    });

    it('allows exception branching and recovery', () => {
      expect(isTransitionAllowed('ASSIGNED', 'EXCEPTION')).toBe(true);
      expect(isTransitionAllowed('IN_PROGRESS', 'EXCEPTION')).toBe(true);
      expect(isTransitionAllowed('EXCEPTION', 'ASSIGNED')).toBe(true);
      expect(isTransitionAllowed('EXCEPTION', 'CLOSED')).toBe(true);
    });

    it('treats unknown states as having no transitions', () => {
      expect(isTransitionAllowed('BOGUS', 'DRAFT')).toBe(false);
    });
  });

  describe('canRoleTransition', () => {
    it('lets a CUSTOMER submit but not approve', () => {
      expect(canRoleTransition('DRAFT', 'SUBMITTED', 'CUSTOMER')).toBe(true);
      expect(canRoleTransition('PENDING_APPROVAL', 'APPROVED', 'CUSTOMER')).toBe(false);
    });

    it('lets a TECHNICIAN start/complete/except but not approve', () => {
      expect(canRoleTransition('ASSIGNED', 'IN_PROGRESS', 'TECHNICIAN')).toBe(true);
      expect(canRoleTransition('IN_PROGRESS', 'COMPLETED', 'TECHNICIAN')).toBe(true);
      expect(canRoleTransition('COMPLETED', 'VERIFIED', 'TECHNICIAN')).toBe(false);
    });

    it('restricts EXCEPTION->CLOSED to ADMIN only', () => {
      expect(canRoleTransition('EXCEPTION', 'CLOSED', 'ADMIN')).toBe(true);
      expect(canRoleTransition('EXCEPTION', 'CLOSED', 'OPS_MANAGER')).toBe(false);
    });
  });

  describe('slaHoursFor', () => {
    it('maps priorities to the right SLA windows', () => {
      expect(slaHoursFor('CRITICAL')).toBe(4);
      expect(slaHoursFor('HIGH')).toBe(8);
      expect(slaHoursFor('MEDIUM')).toBe(24);
      expect(slaHoursFor('LOW')).toBe(72);
      expect(slaHoursFor('NONSENSE')).toBeUndefined();
    });
  });

  it('exposes all 11 statuses', () => {
    expect(ALL_STATUSES).toHaveLength(11);
    expect(ALL_STATUSES).toContain('EXCEPTION');
  });
});
