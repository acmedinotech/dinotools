import { useEffect, useState } from 'react';
import { FormState } from 'src/forms';
import { OneOnly } from '../types';

export type Action<Type = Record<string, any>> = { type?: string; [key: string]: any };
export type ActionBatch<Type = Record<string, any>> = { stateId: string; action: Action<Type> }[];

/**
 * Gets a snapshot of whole application data, and returns current/modified `states[stateId]`.
 * If modifications occur, **you must return a new object**, otherwise, changes will be ignored.
 */
export type Reducer<Type = Record<string, any>, Act = any> = (
    stateId: string,
    action: Action<Act>,
    states: Type
) => Type[keyof Type];
export type Dispatcher<Type = any> = (action: Action<Type>, preCallback?: Function) => void;
export type BatchDispatcher<Type = any> = (actions: ActionBatch<Type>, preCallback?: Function) => void;

export type StoreEvent<Type = any> = {
    eventId: string;
    subEventId?: string;
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
export const defaultReducer = (stateId: string, action: any, states: any) => {
    return { ...states[stateId], ...action };
};

export const KEY_SUBEVENTS = '__subEvents';

export type KeyItemAction = Action<{
    /**
     * Creates or updates an item with this key. Emits `${__key}` subevent.
     */
    __key?: string;
    /**
     * If `__key` is given, `__oldKey` will remove the item at that key if it exists.
     * Emits `${__oldKey}` subevent.
     */
    __oldKey?: string;
    /**
     * Removes `__deleteKey` if it exists. Emits `${__deleteKey}` subevent
     */
    __deleteKey?: string;
}>;

/**
 * This reducer provides a convenient way to store/edit items by key and only get
 * notified for specific items.
 */
export const keyItemReducer: Reducer<Record<string, any>, KeyItemAction> = (stateId: string, action, states: any) => {
    const nstate = { ...states[stateId] };

    const { type, __key, __oldKey, __deleteKey, ...rest } = action;
    const __subEvents: any = {};

    if (__key) {
        __subEvents[__key] = 'add';
        let item = rest;
        if (__oldKey) {
            __subEvents[__oldKey] = 'remove';
            const oldItem = nstate[__oldKey] ?? {};
            delete nstate[__oldKey];

            // merge old with new
            item = { ...oldItem, ...rest };
        }

        nstate[__key] = { ...item };
        nstate[KEY_SUBEVENTS] = __subEvents;
    } else if (__deleteKey) {
        __subEvents[__deleteKey] = 'remove';
        delete nstate[__deleteKey];
        nstate[KEY_SUBEVENTS] = __subEvents;
    }

    return nstate;
};

export const keyItemAdd = (id: string, item: any) => {
    return {
        __key: id,
        ...item,
    };
};

export const keyItemMove = (oldId: string, newId: string, mergeItem?: any) => {
    return {
        __key: newId,
        __oldKey: oldId,
        ...(mergeItem ?? {}),
    };
};

export const keyItemRemove = (id: string) => {
    return { __deleteKey: id };
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

        let excludeMainEvent = false;
        let subEventCount = 0;
        const subEvents = newState[KEY_SUBEVENTS] ?? {};
        for (const subEventId in subEvents) {
            if (subEventId === '!') {
                excludeMainEvent = !!subEvents['!'];
                delete newState[KEY_SUBEVENTS]['!'];
                continue;
            }
            subEventCount++;
            this.emitter.emit(`${stateId}/${subEventId}`, { ...event, subEventId });
        }

        if (!excludeMainEvent || subEventCount === 0) {
            this.emitter.emit(stateId, event);
            this.emitter.emit('postCommit', event);
        }
    }

    getDispatcher(stateId: keyof Type): Dispatcher<Type[keyof Type]> {
        if (!this.reducers[stateId as string]) {
            throw new Error(`no reducer set: ${stateId as string}`);
        }
        return (action: Action, pre?: Function) => {
            pre?.();
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
                const lastSubEvents = newStates[stateId][KEY_SUBEVENTS] ?? {};
                const newSubEvents = newState[KEY_SUBEVENTS] ?? {};
                newStates[stateId] = newState;
                newStates[stateId][KEY_SUBEVENTS] = { ...lastSubEvents, ...newSubEvents };
            }
        }

        this.states = newStates;
        const stateIds = Object.keys(stateIdActions);
        const eventStamp = this.__makeEventStamp();

        for (const stateId of stateIds) {
            const subEvents = newStates[stateId][KEY_SUBEVENTS] ?? {};
            const event = {
                eventId: stateId,
                eventStamp,
                states: newStates,
                isBatch: true,
                batchStateIds: stateIds,
                batchActions: stateIdActions[stateId],
                prevStates,
            } as StoreEventBatchAction;

            let excludeMainEvent = false;
            let subEventCount = 0;
            for (const subEventId in subEvents) {
                if (subEventId === '!') {
                    excludeMainEvent = !!subEvents[subEventId];
                    delete newStates[stateId][KEY_SUBEVENTS]['!'];
                    continue;
                }
                subEventCount++;
                this.emitter.emit(`${stateId}/${subEventId}`, { ...event, subEventId });
            }

            if (!excludeMainEvent || subEventCount === 0) {
                this.emitter.emit(stateId, event);
                this.emitter.emit('postCommit', event);
            }
        }
    }

    getBatchDispatcher(): BatchDispatcher<Type> {
        return (actions: ActionBatch, pre?: Function) => {
            pre?.();
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

/**
 * Allows convenient manipulation of a specific state object having a unique `itemId`.
 * This most closely mimics `useState()` within a React component.
 */
export class KeyItemHandler {
    state: any;
    dispatcher: Dispatcher<any>;
    itemId: string;

    constructor(state: any, dispatcher: Dispatcher, itemId: string) {
        this.state = state;
        this.dispatcher = dispatcher;
        this.itemId = itemId;
    }

    /**
     * Returns the state value if it exists, or `defVal` otherwise.
     * @param defVal
     * @returns
     */
    get(defVal: any = {}) {
        if (this.state[this.itemId]) {
            return this.state[this.itemId];
        } else {
            return defVal;
        }
    }

    /**
     * Creates/updates `itemId` with specific data.
     */
    add(data: any) {
        this.dispatcher(keyItemAdd(this.itemId, data));
    }

    /**
     * Creates/updates `itemId` but merges input data into existing value.
     */
    merge(data: any) {
        this.add({ ...this.get(), ...data });
    }

    /**
     * Rename `itemId` and optionally override the value completely.
     */
    move(newId: string, data?: any) {
        const oldId = this.itemId;
        this.itemId = newId;
        this.dispatcher(keyItemMove(oldId, newId, data));
    }

    /**
     * Removes `itemId`.
     */
    remove() {
        this.dispatcher(keyItemRemove(this.itemId));
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
export const useStoreState = (stateEventId: string, storeId?: string) => {
    const [stateId, subEventId] = stateEventId.split('/');
    const [s, setState] = useState('-');
    const store = getStore(storeId);

    const unsub = store.listenFor(stateEventId, (payload) => {
        setState(payload.eventStamp);
    });
    useEffect(() => unsub);

    return [store.getState(stateId), store.getDispatcher(stateId), store.getBatchDispatcher()];
};
