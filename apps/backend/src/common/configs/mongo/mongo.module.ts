import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigType } from '@nestjs/config';
import mongoConfig from '../mongo.config';

@Global()
@Module({
  imports: [
    MongooseModule.forRootAsync({
      inject: [mongoConfig.KEY],
      useFactory: async (dbConfig: ConfigType<typeof mongoConfig>) => {
        return {
          uri: dbConfig.mongodbUri,
          dbName: dbConfig.mongodbName,
        };
      },
    }),
  ],
  exports: [MongooseModule],
})
export class MongoModule {}
