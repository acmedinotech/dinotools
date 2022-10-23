import { StoreImpl } from "./store"

describe('package: state', () => {
    describe('class StoreImpl', () => {
        type State1 = {k1: string, k2: number};
        type State2 = {k3: boolean};

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
            const unsub = store.listenFor('s1', (stateId, action, states, prevState) => {
                event = {stateId, action, states, prevState};
            });

            const dispatcher = store.getDispatcher('s1');
            
            // @assert: action is handled by reducer and updates s1
            const action1 = {_action: 's1.replace', k1: 'v', k2: 0};
            dispatcher(action1)
            expect(event).toEqual(expect.objectContaining({
                stateId: 's1',
                action: action1
            }));

            // @assert: successfully unsubscribes from state change
            unsub();
            dispatcher({_action: 's1.replace', k1: 'Z', k2: 9});
            expect(event).toEqual(expect.objectContaining({
                stateId: 's1',
                action: action1
            }));
        })
    })
})
