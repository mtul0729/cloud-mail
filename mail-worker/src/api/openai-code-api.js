import app from '../hono/hono';
import emailService from '../service/email-service';
import result from '../model/result';

app.get('/openaiCode/list', async (c) => {
	const data = await emailService.openaiCodeList(c, c.req.query());
	return c.json(result.ok(data));
})

app.get('/openaiCode/latest', async (c) => {
	const list = await emailService.openaiCodeLatest(c, c.req.query());
	return c.json(result.ok(list));
})
