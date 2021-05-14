import {
  GeneratorFn,
  HookFn,
  GeneratorFnOptions,
  DeepPartial,
  CreateFn,
} from './types';
import mergeWith from 'lodash.mergewith';
import { merge, mergeCustomizer } from './merge';

export class FactoryBuilder<T, I, C> {
  constructor(
    private generator: GeneratorFn<T, I, C>,
    private sequence: number,
    private params: DeepPartial<T>,
    private transientParams: Partial<I>,
    private associations: Partial<T>,
    private afterBuilds: HookFn<T>[],
    private onCreates: CreateFn<T, C>[],
  ) {}

  build() {
    const generatorOptions: GeneratorFnOptions<T, I, C> = {
      sequence: this.sequence,
      afterBuild: this.setAfterBuild,
      onCreate: this.setOnCreate,
      params: this.params,
      associations: this.associations,
      transientParams: this.transientParams,
    };

    const object = this.generator(generatorOptions);
    this._mergeParamsOntoObject(object);
    this._callAfterBuilds(object);
    return object;
  }

  async create() {
    const object = this.build();
    return this._callOnCreates(object);
  }

  setAfterBuild = (hook: HookFn<T>) => {
    this.afterBuilds = [hook, ...this.afterBuilds];
  };

  setOnCreate = (hook: CreateFn<T, C>) => {
    this.onCreates = [hook, ...this.onCreates];
  };

  // merge params and associations into object. The only reason 'associations'
  // is separated is because it is typed differently from `params` (Partial<T>
  // vs DeepPartial<T>) so can do the following in a factory:
  // `user: associations.user || userFactory.build()`
  _mergeParamsOntoObject(object: T) {
    merge(object, this.params, this.associations, mergeCustomizer);
  }

  _callAfterBuilds(object: T) {
    this.afterBuilds.forEach(afterBuild => {
      if (typeof afterBuild === 'function') {
        afterBuild(object);
      } else {
        throw new Error('"afterBuild" must be a function');
      }
    });
  }

  async _callOnCreates(object: T | C): Promise<C> {
    if (!this.onCreates.length) {
      throw new Error('Attempted to call `create`, but no onCreate defined');
    }

    const onCreates = [...this.onCreates];
    // TypeScript doesn't know that onCreates is non-empty, so having to hack around this
    // let created = await (onCreates.shift() as CreateFn<T, C>)(object);
    let created = await callOnCreate(
      onCreates.shift() as CreateFn<T, C>,
      object,
    );

    onCreates.forEach(async onCreate => {
      created = await callOnCreate(onCreate, created);
      // if (typeof onCreate === 'function') {
      //   created = await onCreate(created);
      // } else {
      //   throw new Error('"onCreate" must be a function');
      // }
    });

    return created;
  }
}

const callOnCreate = <T, C>(
  onCreate: CreateFn<T, C>,
  created: T | C,
): Promise<C> => {
  if (typeof onCreate === 'function') {
    return onCreate(created);
  } else {
    throw new Error('"onCreate" must be a function');
  }
};
