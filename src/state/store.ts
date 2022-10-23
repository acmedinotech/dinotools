import {EventEmitter} from "events";
import { OneOnly } from "../types";

export type Action<Type = Record<string,any>> = {_action: string; [key: string]: any}
export type ActionBatch<Type = Record<string,any>> = {stateId: string, action: Action<Type>}[]

/**
 * Gets a snapshot of whole application data, and returns current/modified `states[stateId]`.
 * If modifications occur, **you must return a new object**, otherwise, changes will be ignored.
 */
export type Reducer<Type = any> = (stateId: string, action: any, states: Type) => Type[keyof Type];
export type Dispatcher<Type = any> = (action: Action<Type>) => void;
export type BatchDispatcher<Type = any> = (actions: ActionBatch<Type>) => void;
export type StoreEventPayload<Type = any> = {
    states: Type;
    eventStamp: string;
} & {
    isBatch: false;
    stateId: string;
    action: Action<Type>;
    prevState: OneOnly<Type, keyof Type>;
} & {
    isBatch: true;
    batchStateIds: string[]
    batchActions: ActionBatch<Type>;
    prevStates: Type;
}
export type StoreEventHandler<Type = any> = (eventId: string, payload: StoreEventPayload, ...args: any[]) => void;

export interface Store<Type = Record<string,any>> {
    /**
     * Returns current snapshot of the given `stateId`.
     * @param stateId 
     */
    getState(stateId: string): OneOnly<Type, keyof Type>;
    /**
     * Returns all states.
     */
    getStates(): Type;
    /**
     * Gets the action dispatcher for the given `stateId`.
     * @param stateId 
     */
    getDispatcher(stateId: string): Dispatcher;
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
    listenFor(eventId: string, listener: StoreEventHandler): (() => void)
}

/**
 * 
 */
export class StoreImpl<Type = Record<string,any>> implements Store<Type>  {
    emitter = new EventEmitter();
    states: Type;
    reducers: Record<string, Reducer<Type>> = {};

    constructor(_initState: Type) {
        this.states = _initState;
    }

    eventCount = 0;
    __makeEventStamp() {
        return `${++this.eventCount}-${new Date().toISOString()}`
    }

    getState(stateId: string) {
        if (!this.states[stateId]) {
            throw new Error(`no state set: ${stateId}`)
        }
        return this.states[stateId];
    }

    getStates() {
        return {...this.states}
    }

    setReducer(stateId: string, reducer: Reducer<Type>) {
        this.reducers[stateId] = reducer;
    };

    applyReducer(stateId: string, action: Action, state: any) {
        return this.reducers[stateId](stateId, action, this.states);
    }

    dispatch(stateId: string, action: Action) {
        const prevState = {...this.states[stateId]};
        const newState = this.applyReducer(stateId, action, prevState);
        if (newState === prevState) {
            return;
        }

        this.states[stateId] = newState;
        this.emitter.emit(stateId, stateId, {
            eventStamp: this.__makeEventStamp(),
            states: this.states,
            isBatch: false,
            stateId,
            action,
            prevState
        } as StoreEventPayload);
    }

    getDispatcher(stateId: string): Dispatcher<Type> {
        if (!this.reducers[stateId]) {
            throw new Error(`no reducer set: ${stateId}`);
        }
        return (action: Action) => {
            this.dispatch(stateId, action);
        }
    }

    batchDispatch(actions: ActionBatch) {
        const stateIdsChecked: Record<string,boolean> = {};
        const prevStates = {...this.states};
        const newStates = {...this.states};

        for (const {stateId, action} of actions) {
            if (!this.reducers[stateId]) {
                throw new Error(`no reducer set: ${stateId}`);
            }

            const newState = this.applyReducer(stateId, action, newStates);
            if (newState !== prevStates[stateId]) {
                stateIdsChecked[stateId] = true;
                newStates[stateId] = newState;
            }
        }

        this.states = newStates;
        const stateIds = Object.keys(stateIdsChecked);
        const eventStamp = this.__makeEventStamp();
        for (const stateId of stateIds) {
            this.emitter.emit(stateId, stateId, {
                eventStamp,
                states: newStates,
                isBatch: true,
                batchStateIds: stateIds,
                batchActions: actions,
                prevStates
            } as StoreEventPayload)
        }
    }

    getBatchDispatcher(): BatchDispatcher<Type> {
        return (actions: ActionBatch) => {
            this.batchDispatch(actions);
        }
    }

    listenFor(eventId: string, listener: StoreEventHandler) {
        this.emitter.addListener(eventId, listener as ((e:string, ...args: any[]) => void));
        return () => {
            this.emitter.removeListener(eventId, listener as ((e:string, ...args: any[]) => void));
        }
    }
}
