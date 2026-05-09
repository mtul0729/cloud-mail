import app from '../hono/hono';
import BizError from '../error/biz-error';
import { emailConst, isDel } from '../const/entity-const';
import emailUtils from '../utils/email-utils';

function ensureCompatApiKey(c) {
	const configuredKey = String(c.env.COMPAT_API_KEY || '').trim();
	if (!configuredKey) {
		throw new BizError('COMPAT_API_KEY not configured', 503);
	}

	const providedKey = String(c.req.header('x-api-key') || '').trim();
	if (!providedKey || providedKey !== configuredKey) {
		throw new BizError('invalid compat api key', 401);
	}
}

function normalizeMailbox(value) {
	return String(value || '').trim().toLowerCase();
}

function parseLimit(value, fallback = 20) {
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		return fallback;
	}
	return Math.min(parsed, 100);
}

function parseOffset(value) {
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed < 0) {
		return 0;
	}
	return Math.floor(parsed);
}

function normalizeReceivedAt(value) {
	const timestamp = Date.parse(String(value || ''));
	return Number.isFinite(timestamp) ? timestamp : 0;
}

function toRawText(row) {
	return row.text || emailUtils.htmlToText(row.content) || '';
}

function toCompatEmail(row) {
	return {
		id: row.emailId,
		mailbox: normalizeMailbox(row.toEmail),
		from_email: String(row.sendEmail || ''),
		subject: String(row.subject || ''),
		message_id: String(row.messageId || ''),
		raw_text: toRawText(row),
		received_at: normalizeReceivedAt(row.createTime),
	};
}

async function queryEmails(c, mailbox, limit, offset) {
	return await c.env.db.prepare(
		`SELECT
			email_id AS emailId,
			to_email AS toEmail,
			send_email AS sendEmail,
			subject,
			message_id AS messageId,
			text,
			content,
			create_time AS createTime
		FROM email
		WHERE type = ?
			AND is_del = ?
			AND to_email = ? COLLATE NOCASE
		ORDER BY email_id DESC
		LIMIT ? OFFSET ?`
	)
		.bind(emailConst.type.RECEIVE, isDel.NORMAL, mailbox, limit, offset)
		.all();
}

async function queryLatestEmail(c, mailbox) {
	return await c.env.db.prepare(
		`SELECT
			email_id AS emailId,
			to_email AS toEmail,
			send_email AS sendEmail,
			subject,
			message_id AS messageId,
			text,
			content,
			create_time AS createTime
		FROM email
		WHERE type = ?
			AND is_del = ?
			AND to_email = ? COLLATE NOCASE
		ORDER BY email_id DESC
		LIMIT 1`
	)
		.bind(emailConst.type.RECEIVE, isDel.NORMAL, mailbox)
		.first();
}

app.get('/compat/latest', async (c) => {
	ensureCompatApiKey(c);
	const mailbox = normalizeMailbox(c.req.query('to'));
	if (!mailbox) {
		throw new BizError('missing query parameter: to', 400);
	}

	const row = await queryLatestEmail(c, mailbox);
	if (!row) {
		return c.text('', 404);
	}

	return c.json(toCompatEmail(row));
});

app.get('/compat/emails', async (c) => {
	ensureCompatApiKey(c);
	const mailbox = normalizeMailbox(c.req.query('to'));
	if (!mailbox) {
		throw new BizError('missing query parameter: to', 400);
	}

	const limit = parseLimit(c.req.query('limit'));
	const offset = parseOffset(c.req.query('offset'));
	const result = await queryEmails(c, mailbox, limit, offset);
	const rows = Array.isArray(result?.results) ? result.results : [];

	return c.json({
		mailbox,
		emails: rows.map(toCompatEmail),
		limit,
		offset,
	});
});

app.delete('/compat/emails/:id', async (c) => {
	ensureCompatApiKey(c);
	const id = Number(c.req.param('id'));
	if (!Number.isInteger(id) || id <= 0) {
		throw new BizError('invalid email id', 400);
	}

	await c.env.db.prepare(
		`UPDATE email
		SET is_del = ?
		WHERE email_id = ?
			AND type = ?
			AND is_del = ?`
	)
		.bind(isDel.DELETE, id, emailConst.type.RECEIVE, isDel.NORMAL)
		.run();

	return c.json({ ok: true, id });
});
