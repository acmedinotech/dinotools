import {
    ActionBatch,
    defaultReducer,
    keyItemAdd,
    keyItemMove,
    keyItemReducer,
    keyItemRemove,
    StoreEventAction,
    StoreEventBatchAction,
    StoreImpl,
} from './index';

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
                    __subEvents: {},
                },
                s2: {
                    k3: 'c',
                    __subEvents: {},
                },
            });

            unsub1();
            unsub2();
        });
    });

    describe('subEvents', () => {
        const store = new StoreImpl(
            {
                items: { item1: { name: 'Item 1' } },
                other: {},
            },
            {
                items: defaultReducer,
                other: defaultReducer,
            }
        );

        let eventOrder: string[] = [];
        const dispatcher = store.getDispatcher('items');
        const batchDispatcher = store.getBatchDispatcher();
        const eventCounter: Record<string, number> = {
            all: 0,
            item1: 0,
            item2: 0,
            other: 0,
            other1: 0,
        };

        const unsubAll = store.listenFor('items', () => {
            eventCounter.all++;
            eventOrder.push('all');
        });
        const unsub1 = store.listenFor('items/item1', (payload) => {
            eventCounter.item1++;
            eventOrder.push(payload.subEventId ?? '');
        });
        const unsub2 = store.listenFor('items/item2', (payload) => {
            eventCounter.item2++;
            eventOrder.push(payload.subEventId ?? '');
        });
        const unsub3 = store.listenFor('other', (payload) => {
            eventCounter.other++;
            eventOrder.push('other-all');
        });
        const unsub4 = store.listenFor('other/1', (payload) => {
            eventCounter.other1++;
            eventOrder.push(payload.subEventId ?? '');
        });

        afterAll(() => {
            unsubAll();
            unsub1();
            unsub2();
            unsub3();
            unsub4();
        });

        beforeEach(() => {
            eventOrder = [];
        });

        describe('single events', () => {
            it('performs subEvent and event in right order', () => {
                dispatcher({ __subEvents: { item1: true } });
                expect(eventOrder).toEqual(['item1', 'all']);
                expect(eventCounter).toEqual({
                    all: 1,
                    item1: 1,
                    item2: 0,
                    other: 0,
                    other1: 0,
                });
            });
            it('excludes main event', () => {
                dispatcher({ __subEvents: { item1: true, '!': true } });
                expect(eventOrder).toEqual(['item1']);
                expect(eventCounter).toEqual({
                    all: 1,
                    item1: 2,
                    item2: 0,
                    other: 0,
                    other1: 0,
                });
            });
            it('ignores excludes due to no other subEvents', () => {
                dispatcher({ __subEvents: { '!': true } });
                expect(eventOrder).toEqual(['all']);
                expect(eventCounter).toEqual({
                    all: 2,
                    item1: 2,
                    item2: 0,
                    other: 0,
                    other1: 0,
                });
            });
        });

        describe('batch events', () => {
            it('merges subEvents from multiple transforms on same state', () => {
                const oldCounts = { ...eventCounter };
                batchDispatcher([
                    { stateId: 'items', action: { __subEvents: { item1: 'a', '!': false } } },
                    { stateId: 'items', action: { __subEvents: { item2: 'b' } } },
                ]);

                expect(eventOrder).toEqual(['item1', 'item2', 'all']);
                expect(eventCounter.item1 - oldCounts.item1).toEqual(1);
                expect(eventCounter.item2 - oldCounts.item2).toEqual(1);
                expect(store.getState('items')['__subEvents']).toEqual({
                    item1: 'a',
                    item2: 'b',
                });
            });
            it('merges subEvents across 2+ states and excludes main event of items', () => {
                const oldCounts = { ...eventCounter };
                batchDispatcher([
                    { stateId: 'items', action: { __subEvents: { item1: 'f' } } },
                    { stateId: 'items', action: { __subEvents: { item2: 'g', '!': true } } },
                    { stateId: 'other', action: { __subEvents: { '1': 'c' } } },
                    { stateId: 'other', action: { __subEvents: { '1': 'd' } } },
                ]);

                expect(eventOrder).toEqual(['item1', 'item2', '1', 'other-all']);
                expect(eventCounter.item1 - oldCounts.item1).toEqual(1);
                expect(eventCounter.item2 - oldCounts.item2).toEqual(1);
                expect(eventCounter.all - oldCounts.all).toEqual(0);
                expect(eventCounter.other - oldCounts.other).toEqual(1);
                expect(eventCounter.other1 - oldCounts.other1).toEqual(1);
                expect(store.getState('items')['__subEvents']).toEqual({
                    item1: 'f',
                    item2: 'g',
                    // '!' is excluded!
                });
                expect(store.getState('other')['__subEvents']).toEqual({
                    '1': 'd',
                });
            });
        });
    });

    describe('keyItem interactions', () => {
        const store = new StoreImpl(
            {
                items: { item1: { name: 'Item 1' } },
            },
            {
                items: keyItemReducer,
            }
        );

        const events: Record<string, number> = {};
        const dispatcher = store.getDispatcher('items');

        describe('#keyItemReducer() and events', () => {
            const eventCounter: Record<string, number> = {
                all: 0,
                item1: 0,
                item2: 0,
                item2_a: 0,
                item2_b: 0,
            };

            const unsubAll = store.listenFor('items', () => {
                eventCounter.all++;
            });
            const unsub1 = store.listenFor('items/item1', () => {
                eventCounter.item1++;
            });
            const unsub2 = store.listenFor('items/item2', () => {
                eventCounter.item2++;
            });
            const unsub2_a = store.listenFor('items/item2_a', () => {
                eventCounter.item2_a++;
            });
            const unsub2_b = store.listenFor('items/item2_b', () => {
                eventCounter.item2_b++;
            });

            afterAll(() => {
                unsubAll();
                unsub1();
                unsub2();
                unsub2_a();
                unsub2_b();
            });

            it('updates an item', () => {
                dispatcher(keyItemAdd('item1', { name: 'Item 1!' }));
                const state = store.getState('items');
                expect(state['item1']).toEqual({ name: 'Item 1!' });
                expect(state['__subEvents']).toEqual({ item1: 'add' });
            });
            it('adds an item', () => {
                dispatcher(keyItemAdd('item2', { name: 'Item 2' }));
                const state = store.getState('items');
                expect(state['item2']).toEqual({ name: 'Item 2' });
                expect(state['__subEvents']).toEqual({ item2: 'add' });
            });
            it('moves an item', () => {
                dispatcher(keyItemMove('item2', 'item2_a'));
                const state = store.getState('items');
                expect(state['item2_a']).toEqual({
                    name: 'Item 2',
                });
                expect(state['item2']).toBeFalsy();
                expect(state['__subEvents']).toEqual({ item2_a: 'add', item2: 'remove' });
            });
            it('moves and updates an item', () => {
                dispatcher(keyItemMove('item2_a', 'item2_b', { newKey: true }));
                const state = store.getState('items');
                expect(state['item2_b']).toEqual({
                    name: 'Item 2',
                    newKey: true,
                });
                expect(state['item2_a']).toBeFalsy();
                expect(state['__subEvents']).toEqual({ item2_b: 'add', item2_a: 'remove' });
            });
            it('removes an item', () => {
                dispatcher(keyItemRemove('item2_b'));
                const state = store.getState('items');
                expect(state['item2_b']).toBeFalsy();
                expect(state['__subEvents']).toEqual({ item2_b: 'remove' });
            });
            it('triggers expected number of events', () => {
                expect(eventCounter).toEqual({
                    all: 5,
                    item1: 1,
                    item2: 2,
                    item2_a: 2,
                    item2_b: 2,
                });
            });
        });
    });
});
