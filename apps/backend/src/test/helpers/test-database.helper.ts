import mongoose from 'mongoose';

export class TestDatabaseHelper {
  private static connection: typeof mongoose | null = null;

  static async connect(): Promise<void> {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27018';
    const dbName = process.env.MONGODB_NAME || 'discord-test';

    this.connection = await mongoose.connect(`${mongoUri}/${dbName}`);
  }

  static async clearDatabase(): Promise<void> {
    if (!this.connection) {
      throw new Error('Database not connected');
    }

    const collections = mongoose.connection.collections;
    for (const key in collections) {
      await collections[key].deleteMany({});
    }
  }

  static async disconnect(): Promise<void> {
    if (this.connection) {
      await mongoose.connection.close();
      this.connection = null;
    }
  }

  static getConnection(): typeof mongoose {
    if (!this.connection) {
      throw new Error('Database not connected');
    }
    return this.connection;
  }
}
