# `dinotools/state`

The dinotools state management follows a generally typical dispatcher/reducer pattern.  However, the `Store` treats states as top-level structures identified as a `stateId`, and state updates are emitted for that specific `stateId`. This helps to balance separation of concerns (e.g. each `stateId` reflects some core part of application) and decreased state updates (e.g. a component can only listen for its related `stateId` changes). Also, the store has built-in support for batch actions!

For instance, we could have our app defined with states `userInfo` and `pageInfo` as follows:

```javascript
{
    userInfo: {
        loggedIn: boolean;
        id?: string;
        displayName?: string
    },
    pageInfo: {
        title: string;
        canonicalUrl: string
    }
}
```

A reducer can be assigned to each state as follows:

```javascript
store.setReducer('userInfo', (stateId, action, states) => {
    if (action.type === 'userInfo.replace') {
        return states['userInfo'];
    }
    // it's important to return a new object on change, since we don't do a deep diff of objects
    return {...action}
})
```

Note that we are returning the state tied to the `stateId`, not the entire map of states. `states` is given as a convenience to access all app data as read-only, but we can only apply changes to the state the reducer is bound to.

A dispatcher can be retrieved with:

```javascript
const dispatch = store.getDispatcher('pageInfo');

dispatch({type: 'pageInfo.replace', title: 'anything'})
```

> Note: `dispatch()` returns a promise to facilitate async lifecycle hooks (described later). You are not obligated to wait for promise if you don't need synchronous dispatching.

Finally, you can subscribe to state changes with:

```javascript
const unsubscribe = store.listenFor('pageInfo', (eventId, {stateId, state, prevState, states, action }) => {
    // eventId == stateId for all normal state changes
    // prevState would be the initial states.pageInfo
    // state is the current states.pageInfo
    // action is the action applied
});

// stop listening
unsubscribe();
```

As a convenience, all state updates use `eventId = stateId`.

## Batch Actions

The store also handles batch actions through `getBatchDispatcher()`:

```javascript
const batchDispatch = store.getBatchDispatcher();
batchDispatch([
    {stateId: 'userInfo', action: {/* ... */}},
    {stateId: 'userInfo', action: {/* ... */}},
    {stateId: 'pageInfo', action: {/* ... */}},
]);


// the listener receives a different payload:
store.listenFor('specificState', (eventId, {eventStamp, states, isBatch, batchStateIds, batchActions, prevStates}) => {
})
```

The way this works is as follows:

- store treats each action as a separate reducer step
- the computed state of the previous action is used as the current state of the next action
- the current `states` is replaced after the last action
- events are emitted for each unique `stateId` in the batch

So in the above example, a state update is emitted once for `userInfo` and `pageInfo`. Instead of a single action, you receive all the actions related to that `stateId` as `batchActions`. `batchStateIds` holds all the states affected.

## Lifecycle Hooks

To facilitate more complex workflows, the store divides up work into the following lifecycle events which you can hook into:

- `pre-commit`: once reducers run and new state available (but not committed), action/state will be passed to each hook, which can further modify it or trigger an error. **This can directly affect state**.
  - example: state data should be enriched from some external service based on action
  - example: action cannot be applied to current state, so trigger error
- `post-commit`: if a new state is generated, and after listeners are invoked, perform additional work based on new state. **This will not directly affect state**.
  - example: form state gets submitted, so a form handler will see that and do actual submission.

`post-commit` is the easiest hook to work with, since it simply iterates over each hook with no branching logic.

`pre-commit` is more complex. The hook will receive the following callbacks with the following semantics:

- `next(state?)`: if called, the next hook will be invoked. if `state` is given, it becomes the new state, otherwise, the state prior to current hook is passed along
- `stop(state?)`: if called, no other hooks will be invoked. `state` argument follows `next()` semantics
- `abort()`: if called, rejects new changes and commits nothing.

## Roadmap

- ability to define and execute middleware:
  - `pre-update`: called before reducer(s) applied
  - `pre-commit`: called after reducer(s) applied but before state updates are committed
