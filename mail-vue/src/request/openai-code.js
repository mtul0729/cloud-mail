import http from '@/axios/index.js';

export function openaiCodeList(params) {
    return http.get('/openaiCode/list', {params: {...params}})
}

export function openaiCodeLatest(emailId) {
    return http.get('/openaiCode/latest', {params: {emailId}, noMsg: true, timeout: 35 * 1000})
}
