import { Action, Dispatcher, getStore, KeyItemHandler, KEY_SUBEVENTS, Reducer, Store } from '../state';
import { useState, useEffect, SyntheticEvent } from 'react';

export const FORM_RESET = 'form.reset';
export const FORM_UPDATE_FIELD = 'form.field.update1';
export const FORM_UPDATE_FIELDS = 'form.field.updateMany';
export const FORM_SET_ERRORS = 'form.errors.set';
export const FORM_EXEC_OP = 'form.op.exec';

export const OP_EMPTY = '';
export const OP_SUBMIT = 'submit';

/** An error that applies to entire form. */
export const FIELD_ALL = '*';

/**
 * Allows some alteration of state as well as passing params to store for any downstream
 * handlers.
 */
export type ExecOpParams = {
    /**
     * If true, clears any errors.
     */
    clearErrors?: boolean;
    /**
     * If defined, sets an error state.
     */
    setErrors?: FormState['errors'];
    /**
     * Forces lock or unlock if defined. By default, any operation starting with `submit`
     * locks form.
     */
    lock?: boolean;
    /**
     * Additional properties for handler.
     */
    [key: string]: any;
};

/**
 * Basic error message for a field.
 */
export type FieldError = { message: string; meta?: any };

/**
 * Form structure.
 */
export type FormState = {
    status?: 'clean' | 'dirty' | 'error' | 'success';
    /**
     * Signals to downstream that changes cannot be made (e.g. during form submit).
     */
    locked?: boolean;
    /**
     * An arbitrary operation to perform. `submit` is the only explicit one defined --
     * that, along with any operations containing `submit` prefix, will automatically
     * lock form unless specified otherwise.
     */
    execOp?: string;
    /**
     * Additional info to pass to an operation handler.
     */
    execOpParams?: ExecOpParams;
    /**
     * Basic map of form values.
     */
    values: Record<string, any>;
    /**
     * Basic map of error values.
     */
    errors: Record<string, FieldError>;
};

export const getFormState = (s: Partial<FormState> = {}): FormState => {
    return {
        status: 'clean',
        values: {},
        errors: {},
        ...s,
    };
};

/**
 * Receives entire map of values and returns 0 or more errors. Note that this is kept
 * generic enough to operate on entire form to allow a mixture of validators.
 */
export type FormValidator = (values: FormState['values']) => Promise<FormState['errors'] | undefined>;

export type FormAction = Action;

/**
 * Creates a reset action. Allows optional override of specific state properties.
 */
export const resetForm = (form: Partial<FormState> = {}) => {
    return {
        type: FORM_RESET,
        ...form,
    };
};

/**
 * Creates an action to update a single field.
 */
export const updateField = (field: string, value: any) => {
    return {
        type: FORM_UPDATE_FIELD,
        field,
        value,
    };
};

/**
 * Creates an action to update many fields.
 */
export const updateFields = (values: FormState['values']) => {
    return {
        type: FORM_UPDATE_FIELDS,
        values,
    };
};

/**
 * Creates action to perform an action.
 */
export const execOp = (execOp: string, execOpParams?: ExecOpParams) => {
    return {
        type: FORM_EXEC_OP,
        execOp,
        execOpParams,
    };
};

/**
 * Creates an action to set errors.
 */
export const setErrors = (errors: FormState['errors']) => {
    return {
        type: FORM_SET_ERRORS,
        errors,
    };
};

/**
 * Creates a map of `update.${key}` subEvents
 */
export const generateUpdateSubEvents = (fields: Record<string, any>) => {
    const map: Record<string, any> = {};
    for (const key in fields) {
        map[`update.${key}`] = fields[key];
    }
    return map;
};

/**
 * @todo update `status` based on actions
 */
export const formReducer: Reducer<Record<string, any>> = (stateId, action, states) => {
    const { type, ...props } = action;
    if (type === FORM_RESET) {
        return { values: {}, errors: {}, status: 'clean', ...props } as FormState;
    } else if (type === FORM_UPDATE_FIELD) {
        const { field, value } = props;
        return {
            ...states[stateId],
            status: 'dirty',
            values: { ...states[stateId].values, [field]: value },
            [KEY_SUBEVENTS]: generateUpdateSubEvents({ [field]: value }),
        };
    } else if (type === FORM_UPDATE_FIELDS) {
        return {
            ...states[stateId],
            status: 'dirty',
            values: { ...states[stateId].values, ...props.values },
            [KEY_SUBEVENTS]: generateUpdateSubEvents(props.values),
        };
    } else if (type === FORM_SET_ERRORS) {
        return { ...states[stateId], errors: action.errors, locked: false, execOp: undefined, execOpParams: undefined };
    } else if (type === FORM_EXEC_OP) {
        const { execOpParams } = props;
        const locked = action.execOp?.startsWith(OP_SUBMIT);
        let others: any = {};
        if (execOpParams?.clearErrors) {
            others.errors = {};
        } else if (execOpParams?.setErrors) {
            others.errors = execOpParams?.setErrors;
        }
        if (execOpParams?.locked !== undefined) {
            others.locked = execOpParams.locked;
        }
        return { ...states[stateId], locked, execOp: action.execOp, execOpParams, ...others };
    }

    // todo: dinotools/store is emitting change despite no changes being returned
    return states.form;
};

/**
 * Wraps around state/dispatcher and provides various utility methods to interact with state.
 */
export class FormHandler {
    state: FormState;
    dispatcher: Dispatcher<any>;
    validators: FormValidator[] = [];

    constructor(state: FormState, dispatcher: Dispatcher, validators: FormValidator[] = []) {
        this.state = state;
        this.dispatcher = dispatcher;
        this.validators = [...validators];
    }

    isValuesEmpty() {
        return Object.keys(this.state.values).length === 0;
    }

    get(field: string, defVal?: any): any {
        const v = this.state.values[field];
        return v !== undefined ? v : defVal;
    }

    setState(state: FormState) {
        this.state = state;
    }

    reset(form: Partial<FormState>) {
        this.dispatcher(resetForm(form));
    }

    /**
     * Maintains current values but resets everything else.
     */
    softReset() {
        this.reset({ values: this.state.values });
    }

    doOperation(op: string, params?: ExecOpParams) {
        this.dispatcher(execOp(op, params));
    }

    resetOperation(params?: ExecOpParams) {
        this.dispatcher(execOp('', params));
    }

    submit(params?: ExecOpParams) {
        this.doOperation('submit', params);
    }

    updateMany(map: Record<string, any>) {
        this.dispatcher(updateFields(map));
    }

    update(field: string, value: any) {
        this.dispatcher(updateField(field, value));
    }

    /**
     * Invokes validators against state and collectors errors. Allows async validation so
     * that consumers can validate data against external services.
     *
     * The following default behaviors are applied:
     *
     * 1. if 1+ errors detected, dispatch and return errors
     * 2. otherwise, return `undefined` (for convenience in conditional statements)
     *
     * This is because hasErrors() is most likely being called before a submit, and dispatching a
     * change in this case would force a state change without cancelling the currently running code.
     * In other words, we'll have an unintended side-effect of two operations running on two separate
     * states!
     *
     * But since an error would prevent some operation from happening, it is safe to assume that no
     * other steps will be taken on-error, so dispatch errors.
     *
     * The parameters allow you to control this if defaults do not fit your use case
     *
     * @param dispatchOnError Dispatch 1+ errors
     * @param forceDispatch Dispatch 0+ errors
     */
    async hasErrors(dispatchOnError = true, forceDispatch = false) {
        const errors: FormState['errors'] = {};
        for (const validator of this.validators) {
            const verrors = (await validator(this.state.values)) ?? {};
            for (const field in verrors) {
                const err = verrors[field];
                if (errors[field]) {
                    // TODO: how do we properly handle multiple errors if reported by separate validators?
                    errors[field].message += ';; ' + err.message;
                } else {
                    errors[field] = err;
                }
            }
        }

        const errCount = Object.keys(errors).length;
        if (errCount > 0 || forceDispatch) {
            if (dispatchOnError || forceDispatch) {
                this.dispatcher(setErrors(errors));
            }

            return errors;
        }

        return undefined;
    }

    /**
     * Convenience method to always dispatch 0+ errors.
     */
    async checkAndAlwaysDispatchErrors() {
        return await this.hasErrors(true, true);
    }

    /**
     * Convenience method to only return errors;
     */
    async checkAndReturnErrors() {
        return await this.hasErrors(false);
    }

    getOnChangeHandler(field?: string) {
        return (evt: any) => {
            const fname = field ?? evt.target?.name ?? evt.target?.id;
            this.update(fname, evt.target?.value);
        };
    }

    getExecOpHandler(op: string, params?: ExecOpParams) {
        return () => {
            this.doOperation(op, params);
        };
    }

    getKeyItem(id: string) {
        return new KeyItemHandler(this.state, this.dispatcher, id);
    }
}

export type UseStateFormParams = {
    /**
     * The id of the global store to use. If empty, uses default.
     */
    storeId?: string;
    /**
     * Optional validators to initialize FormHandler with.
     */
    validators?: FormValidator[];
};

export const useStoreForm = (stateEventId: string, params: UseStateFormParams = {}): FormHandler => {
    const [stateId, subEventId] = stateEventId.split('/');
    const s = getStore(params.storeId);
    const state = s.getState(stateId);
    const dispatcher = s.getDispatcher(stateId);

    const [_s, _ss] = useState(state);
    const unsub = s.listenFor(stateEventId, (payload) => {
        _ss(payload.states[stateId]);
    });

    useEffect(() => unsub);

    return new FormHandler(state, dispatcher, params.validators ?? []);
};
