import type {HallOfFameEntry} from '../../../shared/types/domain.ts';
import type {DataAdapter} from '../../adapters/DataAdapter.ts';

export class HallOfFameService {
  constructor(private readonly adapter: DataAdapter) {}

  async getRankings(): Promise<HallOfFameEntry[]> {
    return this.adapter.getHallOfFame();
  }
}
