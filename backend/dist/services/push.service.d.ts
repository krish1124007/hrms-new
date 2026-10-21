export interface PushMessage {
    title: string;
    body: string;
    /** Delivered to the app with the push, as strings: what to open on tap. */
    data: {
        type: string;
        link?: string;
        notificationId: string;
    };
}
export interface PushResult {
    /** Devices FCM accepted the message for. */
    sent: number;
    /** Dead tokens deleted from the registry. */
    removed: number;
}
/**
 * Push `msg` to every device registered to `userId`. Resolves to how many
 * devices FCM accepted it for and how many dead tokens were removed;
 * `{ sent: 0, removed: 0 }` when push is not configured or the user has no
 * device. Never throws.
 */
export declare function sendPush(userId: string, msg: PushMessage): Promise<PushResult>;
//# sourceMappingURL=push.service.d.ts.map