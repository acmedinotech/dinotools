import { StoreEventPayload, StoreImpl } from "./store"

describe('package: state', () => {
    describe('class StoreImpl', () => {
        type State1 = {k1: string, k2: number};
        type State2 = {k3: any};

        const store = new StoreImpl<{s1: State1, s2: State2}>({
            s1: {k1: 'true', k2: 1},
            s2: {k3: false}
        })
        
        // const dispatch 

        store.setReducer('s1', (stateId, action, states) => {
            const {_action, ...actionProps} = action;
            if (_action === 's1.replace') {
                return {
                    ...actionProps
                }
            }
            return states.s1;
        })
        
        store.setReducer('s2', (stateId, action, states) => {
            const {_action, ...actionProps} = action;
            if (_action === 's2.replace') {
                return {
                    ...actionProps
                }
            }
            return states.s2;
        })

        it('returns initial state', () => {
            expect(store.getState('s1')).toEqual({
                k1:'true',k2: 1
            });
        })

        it('handles dispatched action and emits event, then unsubscribes', () => {
            let event: any = {};
            let called = 0;
            const unsub = store.listenFor('s1', (eventId, {eventStamp, stateId, action, states, prevState}: Partial<StoreEventPayload>) => {
                event = {eventId, eventStamp, stateId, action, states, prevState};
                called++;
            });

            const dispatcher = store.getDispatcher('s1');
            
            // @assert: action is handled by reducer and updates s1
            const action1 = {_action: 's1.replace', k1: 'v', k2: 0};
            
            dispatcher(action1)
            const {eventStamp, ...restEvent} = event;
            expect(restEvent).toEqual(expect.objectContaining({
                eventId: 's1',
                stateId: 's1',
                action: action1,
                states: {
                    s1: {
                        k1: 'v',
                        k2: 0
                    },
                    s2: {
                        k3: false
                    }
                },
                prevState: {
                    k1: 'true',
                    k2: 1
                }
            }));
            expect(eventStamp).toMatch(/1-/);

            // @assert: successfully unsubscribes from state change
            unsub();
            dispatcher({_action: 's1.replace', k1: 'Z', k2: 9});
            expect(called).toEqual(1);
        })

        it('handles batch actions', () => {
            let events: any[] = [];
            let called = 0;
            const unsub1 = store.listenFor('s1', (eventId, {eventStamp, stateId, action, states, prevState}: Partial<StoreEventPayload>) => {
                events.push({eventId, eventStamp, stateId, action, states, prevState});
                called++;
            });
            const unsub2 = store.listenFor('s2', (eventId, {eventStamp, stateId, action, states, prevState}: Partial<StoreEventPayload>) => {
                events.push({eventId, eventStamp, stateId, action, states, prevState});
                called++;
            });

            store.getBatchDispatcher()([
                { stateId: 's1', action: {_action: 's1.replace', k1: 'a', k2: 0}},
                { stateId: 's1', action: {_action: 's1.replace', k1: 'b', k2: 1}},
                { stateId: 's2', action: {_action: 's2.replace', k3: 'c' }}
            ])

            expect(events.length).toEqual(2);

            unsub1();
            unsub2();
        })
    })
})
