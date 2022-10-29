import { useEffect, useState } from 'react';
import { FormState } from 'src/forms';
import { OneOnly } from '../types';

export type Action<Type = Record<string, any>> = { type?: string; [key: string]: any };
export type ActionBatch<Type = Record<string, any>> = { stateId: string; action: Action<Type> }[];

/**
 * Gets a snapshot of whole application data, and returns current/modified `states[stateId]`.
 * If modifications occur, **you must return a new object**, otherwise, changes will be ignored.
 */
export type Reducer<Type = Record<string, any>> = (stateId: string, action: any, states: Type) => Type[keyof Type];
export type Dispatcher<Type = any> = (action: Action<Type>) => void;
export type BatchDispatcher<Type = any> = (actions: ActionBatch<Type>) => void;

export type StoreEvent<Type = any> = {
    eventId: string;
    eventStamp: string;
    states: Type;
    isBatch: boolean;
};
export type StoreEventAction<Type = any> = StoreEvent<Type> & {
    stateId: string;
    action: Action<Type>;
    prevState: Type[keyof Type];
};
export type StoreEventBatchAction<Type = any> = StoreEvent<Type> & {
    batchStateIds: string[];
    batchActions: Action<Type>[];
    prevStates: Type;
};

export type AllStoreEvents = StoreEventAction | StoreEventBatchAction;

export type StoreEventHandler<Type = any> = (payload: AllStoreEvents, ...args: any[]) => void;

export type HookContext = {
    lifecycle: 'pre-commit';
    next: (state?: any) => void;
    stop: (state?: any) => void;
    abort: () => void;
};
export type HookHandler = (context: HookContext, event: StoreEvent) => Promise<any>;

export interface Store<Type = Record<string, any>> {
    /**
     * Returns current snapshot of the given `stateId`.
     * @param stateId
     */
    getState(stateId: keyof Type): Type[keyof Type];
    /**
     * Returns all states.
     */
    getStates(): Type;
    /**
     * Gets the action dispatcher for the given `stateId`.
     * @param stateId
     */
    getDispatcher(stateId: keyof Type): Dispatcher<Type[keyof Type]>;
    /**
     * Gets the bulk dispatcher. The semantics are as follows:
     *
     * - for any stateId changed 1+ times, emit a single event for that
     * - each `stateIds` value is simply `[stateId]`
     *   - FUTURE: include every stateId updated?
     */
    getBatchDispatcher(): BatchDispatcher;
    /**
     * Get notified of store events. For typical state updates, you can simply listen
     * for `stateId` as the `eventId`. Other `eventIds` TBD.
     * @return A callback function that removes the listener.
     */
    listenFor(eventId: string, listener: StoreEventHandler): () => void;
}

class Emitter {
    _listeners: Record<string, Function[]> = {};

    on(eventId: string, fn: Function) {
        if (!this._listeners[eventId]) {
            this._listeners[eventId] = [];
        }
        this._listeners[eventId].push(fn);
    }

    emit(eventId: string, ...args: any[]) {
        if (!this._listeners[eventId]) {
            return;
        }
        for (const fn of this._listeners[eventId]) {
            fn(...args);
        }
    }

    off(eventId: string, fn: Function) {
        if (!this._listeners[eventId]) {
            return this;
        }
        this._listeners[eventId] = this._listeners[eventId].filter((f) => f !== fn);
        return this;
    }
}

/**
 * For each defined state, this reducer is automatically applied if not overridden, and
 * allows for a simple merging of existing state with action. This makes the dispatch for the
 * state operate like React's `useState()`
 */
const defaultReducer = (stateId: string, action: any, states: any) => {
    return { ...states[stateId], ...action };
};

/**
 *
 */
export class StoreImpl<Type = Record<string, any>> implements Store<Type> {
    states: Type;
    reducers: Record<string, Reducer> = {};
    emitter = new Emitter();

    constructor(_initState: Type, _reducers: Record<string, Reducer> = {}) {
        this.states = _initState;
        for (const key in _initState) {
            this.reducers[key] = _reducers[key] ?? defaultReducer;
        }
    }

    eventCount = 0;
    __makeEventStamp() {
        return `${++this.eventCount}-${new Date().toISOString()}`;
    }

    getState(stateId: keyof Type) {
        if (!this.states[stateId]) {
            throw new Error(`no state set: ${stateId as string}`);
        }
        return this.states[stateId];
    }

    getStates() {
        return { ...this.states };
    }

    setReducer(stateId: string, reducer: Reducer) {
        this.reducers[stateId] = reducer;
    }

    applyReducer(stateId: string, action: Action, state: any) {
        return this.reducers[stateId](stateId, action, this.states);
    }

    dispatch(stateId: string, action: Action) {
        const prevState = { ...this.states[stateId] };
        const newState = this.applyReducer(stateId, action, prevState);
        if (newState === prevState) {
            return;
        }

        this.states[stateId] = newState;

        const event = {
            eventId: stateId,
            eventStamp: this.__makeEventStamp(),
            states: this.states,
            isBatch: false,
            stateId,
            action,
            prevState,
        } as StoreEventAction;
        this.emitter.emit(stateId, event);
        this.emitter.emit('postCommit', event);
    }

    getDispatcher(stateId: keyof Type): Dispatcher<Type[keyof Type]> {
        if (!this.reducers[stateId as string]) {
            throw new Error(`no reducer set: ${stateId as string}`);
        }
        return (action: Action) => {
            this.dispatch(stateId as string, action);
        };
    }

    batchDispatch(actions: ActionBatch) {
        const stateIdActions: Record<string, Action[]> = {};
        const prevStates = { ...this.states };
        const newStates = { ...this.states };

        const pushAction = (stateId: string, action: Action) => {
            if (!stateIdActions[stateId]) {
                stateIdActions[stateId] = [];
            }

            stateIdActions[stateId].push(action);
        };

        for (const { stateId, action } of actions) {
            if (!this.reducers[stateId]) {
                throw new Error(`no reducer set: ${stateId}`);
            }

            const newState = this.applyReducer(stateId, action, newStates);
            if (newState !== prevStates[stateId]) {
                pushAction(stateId, action);
                newStates[stateId] = newState;
            }
        }

        this.states = newStates;
        const stateIds = Object.keys(stateIdActions);
        const eventStamp = this.__makeEventStamp();
        for (const stateId of stateIds) {
            const event = {
                eventId: stateId,
                eventStamp,
                states: newStates,
                isBatch: true,
                batchStateIds: stateIds,
                batchActions: stateIdActions[stateId],
                prevStates,
            } as StoreEventBatchAction;
            this.emitter.emit(stateId, event);
            this.emitter.emit('postCommit', event);
        }
    }

    getBatchDispatcher(): BatchDispatcher<Type> {
        return (actions: ActionBatch) => {
            this.batchDispatch(actions);
        };
    }

    lcount = 0;
    listenFor(eventId: string, listener: StoreEventHandler) {
        this.emitter.on(eventId, listener);
        const tstamp = this.lcount++;
        return () => {
            this.emitter.off(eventId, listener);
        };
    }
}

const globalStores: Record<string, Store> = {};

export const getStore = (_id?: string): Store => {
    const id = _id ?? 'default';
    if (!globalStores[id]) {
        throw new Error(`dinotools.state: store not found: ${id}`);
    }

    return globalStores[id];
};

export const setStore = (store: Store, _id?: string) => {
    const id = _id ?? 'default';
    if (globalStores[id]) {
        throw new Error(`dinotools.state: store already exists: ${id}`);
    }

    globalStores[id] = store;
    return store;
};

/**
 * React hook to fetch current state and dispatcher from a global store. New
 * changes to store state trigger React state change. Note that this means
 * anyone with access to this state's dispatcher can influence the component
 * using this hook. The React state value uses the store's eventStamp to avoid
 * potential duplication of event processing on this specific hook instance.
 *
 * @return {[FormState, Dispatcher<FormState>, BatchDispatcher]}
 */
export const useStoreState = (stateId: string, storeId?: string) => {
    const [s, setState] = useState('-');
    const store = getStore(storeId);

    const unsub = store.listenFor(stateId, (payload) => {
        setState(payload.eventStamp);
    });
    useEffect(() => unsub);

    return [store.getState(stateId), store.getDispatcher(stateId), store.getBatchDispatcher()];
};
