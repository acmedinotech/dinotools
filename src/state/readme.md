# `dinotools/state`

The dinotools state management follows a generally typical dispatcher/reducer pattern. However, the `Store` treats states as top-level structures identified as a `stateId`. For instance, we could have `userInfo` and `pageInfo` states as follows:

```javascript
{
    userInfo: {
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
    if (action.type === 'someAction') {
        return {...states, userInfo: {...action}}
    }
    return states;
})
```

The reducer gets **all states**. However, anything it returns is treated as an update to just that state. This eases the development of applications by having read-only access to all the data.

A dispatcher can be retrieved with:

```javascript
store.getDispatcher('pageInfo')
```

Finally, you can subscribe to state changes with:

```javascript
const unsubscribe = store.listenFor('pageInfo', (stateId, action, states, prevState) => {
    // react to this state change
});

// unsubscribe() will stop listening
```
