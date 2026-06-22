import { describe, expect, it, vi } from 'vitest';
import { loadExportData } from '../api/admin/export.js';

describe('loadExportData', () => {
  it('loads the complete export in one database round trip', async () => {
    const execute = vi.fn().mockResolvedValue([{ data: {
      players: [{ id: 'player-1', display_rating: 'B2' }],
      auditLog: [{ actor_membership_id: 'admin-1', details: { source_id: 'external-1' } }],
    } }]);

    const result = await loadExportData({ execute });

    expect(execute).toHaveBeenCalledTimes(1);
    expect(result.players).toEqual([{ id: 'player-1', displayRating: 'B2' }]);
    expect(result.auditLog).toEqual([{
      actorMembershipId: 'admin-1',
      details: { source_id: 'external-1' },
    }]);
    expect(result.seasons).toEqual([]);
  });
});
