import { Global, Inject, Module } from '@nestjs/common';

import { AppConfig, loadConfig } from './env.schema';

export const APP_CONFIG = Symbol('APP_CONFIG');

/** Shorthand for `@Inject(APP_CONFIG)`. */
export const InjectConfig = () => Inject(APP_CONFIG);

@Global()
@Module({
  providers: [{ provide: APP_CONFIG, useFactory: (): AppConfig => loadConfig() }],
  exports: [APP_CONFIG],
})
export class ConfigModule {}
