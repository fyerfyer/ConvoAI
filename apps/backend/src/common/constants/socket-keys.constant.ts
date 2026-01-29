export class SocketKeys {
  static userRoom(userId: string): string {
    return `user_room:${userId}`;
  }
}
