import {
    execOp,
    FormHandler,
    formReducer,
    FormState,
    FormValidator,
    resetForm,
    setErrors,
    updateField,
    updateFields,
} from './index';
import { StoreImpl } from '../state';
import exp from 'constants';

describe('package: forms', () => {
    const initialForm: FormState = {
        values: { x: 1 },
        errors: { x: { message: 'bad' } },
        status: 'clean',
    };

    const store = new StoreImpl<{ form: FormState }>({
        form: initialForm,
    });
    store.setReducer('form', formReducer);
    const dispatcher = store.getDispatcher('form');

    describe('#formReducer()', () => {
        const errors = { a: { message: 'bad' } };

        it('resets form completely', () => {
            dispatcher(resetForm());
            expect(store.getState('form')).toEqual({
                values: {},
                errors: {},
                status: 'clean',
            });
        });
        it('resets form to initialState', () => {
            dispatcher(resetForm(initialForm));
            expect(store.getState('form')).toEqual(initialForm);
        });
        it('updates single field', () => {
            dispatcher(updateField('z', [1, 2]));
            expect(store.getState('form').values).toEqual({
                x: 1,
                z: [1, 2],
            });
        });
        it('updates multiple fields', () => {
            dispatcher(resetForm());
            dispatcher(updateFields({ a: 1, x: 99 }));
            expect(store.getState('form').values).toEqual({
                a: 1,
                x: 99,
            });
        });
        it('sets errors', () => {
            dispatcher(setErrors(errors));
            expect(store.getState('form').errors).toEqual(errors);
            dispatcher(setErrors({}));
            expect(store.getState('form').errors).toEqual({});
        });

        it('sets executeOperation to submit and submit.*', () => {
            dispatcher(setErrors(errors));

            dispatcher(execOp('submit'));
            expect(store.getState('form')).toEqual(
                expect.objectContaining({
                    locked: true,
                    errors,
                    execOp: 'submit',
                })
            );

            dispatcher(execOp('submit.prefix'));
            expect(store.getState('form')).toEqual(
                expect.objectContaining({
                    locked: true,
                    errors,
                    execOp: 'submit.prefix',
                })
            );
        });
        it('sets executeOperation with overrides', () => {
            dispatcher(setErrors(errors));
            dispatcher(
                execOp('test', {
                    clearErrors: true,
                    locked: true,
                    extra: 'param',
                })
            );
            expect(store.getState('form')).toEqual(
                expect.objectContaining({
                    locked: true,
                    errors: {},
                    execOp: 'test',
                    execOpParams: {
                        clearErrors: true,
                        locked: true,
                        extra: 'param',
                    },
                })
            );
        });
    });

    describe('class FormHandler', () => {
        const validators: FormValidator[] = [
            async (values) => {
                if (values.is_error) {
                    return {
                        is_error: {
                            message: 'is_error exists!',
                        },
                    };
                }
            },
            async (values) => {
                if (!values.age?.match(/^\d+$/)) {
                    return { age: { message: 'must be number' } };
                }
            },
            async (values) => {
                if (!values.age?.match(/^2\d+$/)) {
                    return { age: { message: 'must start with 2' } };
                }
            },
        ];

        const expectedErrors = {
            is_error: {
                message: 'is_error exists!',
            },
            age: { message: 'must be number;; must start with 2' },
        };

        dispatcher(resetForm({ values: { is_error: true, age: 'five' } }));

        let formHandler = new FormHandler(store.getState('form'), dispatcher, validators);

        afterEach(() => {
            formHandler.softReset();
            formHandler = new FormHandler(store.getState('form'), dispatcher, validators);
        });

        it('finds and dispatches errors', async () => {
            const errors = await formHandler.hasErrors();
            expect(errors).toBeTruthy();
            expect(store.getState('form').errors).toEqual(expectedErrors);
        });

        it('finds and returns errors', async () => {
            const errors = await formHandler.checkAndReturnErrors();
            expect(errors).toEqual(expectedErrors);
            expect(store.getState('form').errors).toEqual({});
        });

        it('dispatches 0 errors', async () => {
            formHandler.reset({ values: { age: '20' }, errors: { age: { message: 'erase plz' } } });
            formHandler.setState(store.getState('form'));
            const errors = await formHandler.checkAndAlwaysDispatchErrors();
            expect(errors).toBeUndefined;
            expect(store.getState('form').errors).toEqual({});
        });

        it('triggers submit', () => {
            formHandler.submit({ key: 'val' });
            expect(store.getState('form').execOp).toEqual('submit');
            expect(store.getState('form').execOpParams).toEqual({ key: 'val' });
        });

        it('updates fields', () => {
            formHandler.update('a', 1);
            formHandler.updateMany({ b: 2, c: '3' });
            expect(store.getState('form').values).toEqual(expect.objectContaining({ a: 1, b: 2, c: '3' }));
        });
    });
});
