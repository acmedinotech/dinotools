import { execOp, formReducer, FormState, resetForm, setErrors, updateField, updateFields } from './index';
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
});
