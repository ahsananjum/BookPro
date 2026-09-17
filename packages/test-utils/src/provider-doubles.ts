export class FakePaymentProvider {
    public charges: Array<{ id: string; amount: number; currency: string }> = [];

    async createPaymentIntent(amountCents: number, currency = "usd") {
        const id = `pi_fake_${Math.random().toString(36).substring(7)}`;
        this.charges.push({ id, amount: amountCents, currency });
        return { id, clientSecret: `${id}_secret` };
    }
}

export class FakeEmailProvider {
    public sentEmails: Array<{ to: string; subject: string; body: string }> = [];

    async sendEmail(to: string, subject: string, body: string) {
        this.sentEmails.push({ to, subject, body });
        return { success: true, messageId: `msg_${Date.now()}` };
    }
}
