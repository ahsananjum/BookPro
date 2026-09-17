import { publicCreatePaymentIntentSchema } from '@bookpro/validation';

const body = {
    bookingHoldId: "80388788-a593-4f59-b221-2b4ae911c94c",
    guestToken: "gst_ODAzODg3ODgtYTU5My00ZjU5LWIyMjEtMmI0YWU5MTFjOTRjOmQ0ZGRlMjRhODIxZDg0NThjOTIzYjRjNDNlOTY3ZWRlYmU4YTVlYTA3ODkzYzg5NTFhMGJkMGVjMmZhYTk5NDc",
    idempotencyKey: "pi_80388788-a593-4f59-b221-2b4ae911c94c_1756589337743",
};

const result = publicCreatePaymentIntentSchema.safeParse(body);
console.log("SafeParse result:", result);
