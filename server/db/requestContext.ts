import {AsyncLocalStorage} from 'node:async_hooks';

export interface DbRequestContext {
  userId: string;
  globalRole:
    | 'user'
    | 'super_admin'
    | 'auth_resolver'
    | 'system_seed'
    | 'invitation_activator'
    | 'public';
  requestId?: string;
}

const storage = new AsyncLocalStorage<DbRequestContext>();

export const dbRequestContext = {
  run<T>(context: DbRequestContext, fn: () => T): T {
    return storage.run(context, fn);
  },
  get(): DbRequestContext {
    return (
      storage.getStore() || {
        userId: '',
        globalRole: 'public',
      }
    );
  },
};
