import { ActionBatch, StoreEventAction, StoreEventBatchAction, StoreImpl } from './index';

describe('package: state', () => {
    describe('class StoreImpl', () => {
        type State1 = { k1: string; k2: number };
        type State2 = { k3: any };

        const store = new StoreImpl<{ s1: State1; s2: State2 }>({
            s1: { k1: 'true', k2: 1 },
            s2: { k3: false },
        });

        // const dispatch

        store.setReducer('s1', (stateId, action, states) => {
            const { type, ...actionProps } = action;
            if (type === 's1.replace') {
                return {
                    ...actionProps,
                };
            }
            return states.s1;
        });

        store.setReducer('s2', (stateId, action, states) => {
            const { type, ...actionProps } = action;
            if (type === 's2.replace') {
                return {
                    ...actionProps,
                };
            }
            return states.s2;
        });

        it('returns initial state', () => {
            expect(store.getState('s1')).toEqual({
                k1: 'true',
                k2: 1,
            });
        });

        it('handles dispatched action and emits event, then unsubscribes', () => {
            let event: any = {};
            let called = 0;
            const unsub = store.listenFor('s1', (payload) => {
                event = { ...payload };
                called++;
            });

            const dispatcher = store.getDispatcher('s1');

            // @assert: action is handled by reducer and updates s1
            const action1 = { type: 's1.replace', k1: 'v', k2: 0 };

            dispatcher(action1);
            const { eventStamp, ...restEvent } = event;
            expect(restEvent).toEqual(
                expect.objectContaining({
                    eventId: 's1',
                    stateId: 's1',
                    action: action1,
                    states: {
                        s1: {
                            k1: 'v',
                            k2: 0,
                        },
                        s2: {
                            k3: false,
                        },
                    },
                    prevState: {
                        k1: 'true',
                        k2: 1,
                    },
                })
            );
            expect(eventStamp).toMatch(/1-/);

            // @assert: successfully unsubscribes from state change
            unsub();
            dispatcher({ type: 's1.replace', k1: 'Z', k2: 9 });
            expect(called).toEqual(1);
        });

        it('handles batch actions', () => {
            const events: any[] = [];
            let called = 0;
            const unsub1 = store.listenFor('s1', (payload) => {
                expect(payload.eventId).toEqual('s1');
                const { isBatch, batchStateIds, batchActions } = payload as StoreEventBatchAction;
                // @assert: batch payload
                expect(isBatch).toBeTruthy();
                // @assert: affected stateIds
                expect(batchStateIds).toEqual(['s1', 's2']);
                // @assert: specific actions for s1
                expect(batchActions.length).toEqual(2);
                events.push({ ...payload });
            });
            const unsub2 = store.listenFor('s2', (payload) => {
                expect(payload.eventId).toEqual('s2');
                const { eventStamp, batchStateIds, batchActions } = payload as StoreEventBatchAction;
                // @assert: part of same batch process
                expect(events[0].eventStamp).toEqual(eventStamp);
                // @assert: affected stateIds
                expect(batchStateIds).toEqual(['s1', 's2']);
                // @assert: specific actions for s2
                expect(batchActions.length).toEqual(1);
                events.push({ ...payload });
            });

            const batch = [
                { stateId: 's1', action: { type: 's1.replace', k1: 'a', k2: 0 } },
                { stateId: 's1', action: { type: 's1.replace', k1: 'b', k2: 1 } },
                { stateId: 's2', action: { type: 's2.replace', k3: 'c' } },
            ];

            store.getBatchDispatcher()(batch);

            // @assert: same state values emitted for each state update
            expect(events.length).toEqual(2);
            expect(events[0].states).toEqual(events[1].states);
            expect(events[0].prevStates).toEqual(events[1].prevStates);

            // @assert: states changed as expected
            expect(events[0].states).toEqual({
                s1: {
                    k1: 'b',
                    k2: 1,
                },
                s2: {
                    k3: 'c',
                },
            });

            unsub1();
            unsub2();
        });
    });
});
