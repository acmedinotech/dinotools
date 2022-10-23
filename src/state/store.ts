import {EventEmitter} from "events";
import { OneOnly } from "../types";

export type Action<Type = Record<string,any>> = {_action: string; [key: string]: any}
export type ActionBatch<Type = Record<string,any>> = {stateId: string, action: Action<Type>}[]

/**
 * Gets a snapshot of whole application data, and returns current/modified `states[stateId]`.
 * If modifications occur, **you must return a new object**, otherwise, changes will be ignored.
 */
export type Reducer<Type = any> = (stateId: string, action: any, states: Type) => Type[keyof Type];
export type Dispatcher<Type = any> = (action: Action<Type> | Action<Type>) => void;
export type StoreEventHandler<Type = any> = (eventId: string, action: any, states: Type, state: OneOnly<Type, keyof Type>) => void;

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

    __dispatch(stateId: string, action: Action) {
        const reducer = this.reducers[stateId];
        const prevState = {...this.states[stateId]};
        const newState = reducer(stateId, action, this.states);
        if (newState === prevState) {
            return;
        }

        this.states[stateId] = newState;
        this.emitter.emit(stateId, stateId, action, this.states, prevState);
    }

    getDispatcher(stateId: string): Dispatcher {
        if (!this.reducers[stateId]) {
            throw new Error(`no reducer set: ${stateId}`);
        }
        return (action: Action) => {
            this.__dispatch(stateId, action);
        }
    }

    listenFor(eventId: string, listener: StoreEventHandler) {
        this.emitter.addListener(eventId, listener);
        return () => {
            this.emitter.removeListener(eventId, listener);
        }
    }
}
