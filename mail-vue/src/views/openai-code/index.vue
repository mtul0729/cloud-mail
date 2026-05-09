<template>
  <div class="openai-code-page">
    <div class="toolbar">
      <div class="toolbar-left">
        <Icon class="icon" icon="ion:reload" width="18" height="18" @click="refresh"/>
        <Icon class="icon" @click="changeTimeSort" icon="material-symbols-light:timer-arrow-down-outline"
              v-if="params.timeSort === 0" width="28" height="28"/>
        <Icon class="icon" @click="changeTimeSort" icon="material-symbols-light:timer-arrow-up-outline" v-else
              width="28" height="28"/>
      </div>
      <div class="toolbar-right">
        <span class="email-count" v-if="total">{{ $t('emailCount', {total: total}) }}</span>
      </div>
    </div>

    <el-scrollbar class="scroll" v-loading="loading && list.length === 0">
      <div class="code-list" v-if="list.length > 0">
        <div class="code-row" v-for="item in list" :key="item.emailId" @click="jumpContent(item)">
          <div class="code-main">
            <button class="code-value" @click.stop="copyCode(item.code)">{{ item.code }}</button>
            <div class="message">
              <div class="subject">{{ item.subject || $t('noSubject') }}</div>
              <div class="preview">{{ item.formatText || '\u200B' }}</div>
            </div>
          </div>
          <div class="meta">
            <div class="address">
              <span>{{ item.toEmail }}</span>
              <span>{{ item.sendEmail }}</span>
            </div>
            <span class="time">{{ item.formatCreateTime }}</span>
          </div>
          <div class="user" v-if="item.userEmail">
            <Icon icon="mynaui:user" width="18" height="18"/>
            <span>{{ item.userEmail }}</span>
          </div>
        </div>
        <div class="footer">
          <el-button text :loading="loadingMore" v-if="!noMore" @click="loadData">{{ $t('more') }}</el-button>
          <span v-else>{{ $t('noMoreData') }}</span>
        </div>
      </div>
      <div class="empty" v-else-if="!loading">
        <el-empty :description="$t('noMessagesFound')"/>
      </div>
    </el-scrollbar>
  </div>
</template>

<script setup>
import {Icon} from "@iconify/vue";
import {defineOptions, onMounted, onUnmounted, reactive, ref} from "vue";
import {openaiCodeLatest, openaiCodeList} from "@/request/openai-code.js";
import {fromNow} from "@/utils/day.js";
import {sleep} from "@/utils/time-utils.js";
import {useSettingStore} from "@/store/setting.js";
import {useEmailStore} from "@/store/email.js";
import router from "@/router/index.js";
import {useRoute} from "vue-router";
import {useI18n} from "vue-i18n";

defineOptions({
  name: 'openai-code'
})

const {t} = useI18n();
const route = useRoute();
const settingStore = useSettingStore();
const emailStore = useEmailStore();
const list = ref([]);
const latestEmail = ref(null);
const total = ref(0);
const loading = ref(false);
const loadingMore = ref(false);
const noMore = ref(false);
const params = reactive({
  timeSort: 0,
  size: 50,
});

let timer = null;
let reqLock = false;
let latestStop = false;

onMounted(() => {
  refresh();
  latest();
  timer = setInterval(() => {
    list.value.forEach(item => {
      item.formatCreateTime = fromNow(item.createTime);
    })
  }, 1000 * 60);
})

onUnmounted(() => {
  latestStop = true;
  clearInterval(timer);
})

function changeTimeSort() {
  params.timeSort = params.timeSort ? 0 : 1;
  refresh();
}

function refresh() {
  list.value = [];
  noMore.value = false;
  loadData(true);
}

async function loadData(refresh = false) {
  if (reqLock) return;
  if (noMore.value && !refresh) return;

  reqLock = true;
  loading.value = refresh || list.value.length === 0;
  loadingMore.value = !loading.value;

  const emailId = refresh || list.value.length === 0 ? 0 : list.value.at(-1).emailId;

  try {
    const data = await openaiCodeList({
      emailId,
      size: params.size,
      timeSort: params.timeSort
    });
    const rows = handleList(data.list || []);

    if (refresh) {
      list.value = [];
    }

    list.value.push(...rows);
    total.value = data.total;
    latestEmail.value = data.latestEmail;
    noMore.value = rows.length < params.size;
  } finally {
    loading.value = false;
    loadingMore.value = false;
    reqLock = false;
  }
}

function handleList(rows) {
  return rows.map(item => ({
    ...item,
    formatCreateTime: fromNow(item.createTime)
  }))
}

async function latest() {
  while (!latestStop) {
    let autoRefresh = settingStore.settings.autoRefresh;
    await sleep(autoRefresh > 1 ? autoRefresh * 1000 : 3000);

    const latestId = latestEmail.value?.emailId;

    if (autoRefresh < 2 || route.name !== 'openai-code' || params.timeSort !== 0) {
      continue;
    }

    if (!latestId && latestId !== 0) {
      continue;
    }

    try {
      const rows = handleList(await openaiCodeLatest(latestId));

      for (let row of rows.reverse()) {
        if (!list.value.some(item => item.emailId === row.emailId)) {
          list.value.unshift(row);
          total.value++;
        }

        if (row.emailId > latestEmail.value?.emailId) {
          latestEmail.value = row;
        }
      }
    } catch (e) {
      if (e.code === 401 || e.code === 403) {
        settingStore.settings.autoRefresh = 0;
      }
      console.error(e)
    }
  }
}

async function copyCode(code) {
  try {
    await navigator.clipboard.writeText(code);
    ElMessage({
      message: t('copySuccessMsg'),
      type: 'success',
      plain: true
    })
  } catch (err) {
    console.error(`${t('copyFailMsg')}:`, err);
    ElMessage({
      message: t('copyFailMsg'),
      type: 'error',
      plain: true
    })
  }
}

function jumpContent(email) {
  emailStore.contentData.email = email
  emailStore.contentData.delType = 'physics'
  emailStore.contentData.showStar = false
  emailStore.contentData.showReply = false
  router.push({name: 'content'})
}
</script>

<style scoped lang="scss">
.openai-code-page {
  display: grid;
  grid-template-rows: auto 1fr;
  height: 100%;
  overflow: hidden;
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 15px;
  padding: 8px 15px;
  box-shadow: var(--header-actions-border);
  color: var(--el-text-color-primary);
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 20px;
}

.toolbar-right {
  white-space: nowrap;
}

.icon {
  cursor: pointer;
}

.scroll {
  height: 100%;
}

.code-list {
  min-height: 100%;
}

.code-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(220px, auto);
  gap: 12px 24px;
  padding: 12px 16px;
  box-shadow: var(--header-actions-border);
  cursor: pointer;
  color: var(--el-text-color-primary);

  &:hover {
    background-color: var(--email-hover-background);
  }

  @media (max-width: 767px) {
    grid-template-columns: 1fr;
  }
}

.code-main {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 14px;
  min-width: 0;
}

.code-value {
  border: 1px solid var(--el-border-color);
  border-radius: 6px;
  padding: 5px 10px;
  min-width: 82px;
  background: var(--el-fill-color-light);
  color: var(--el-color-primary);
  font-size: 20px;
  font-weight: 700;
  line-height: 1.2;
  letter-spacing: 0;
  cursor: pointer;
}

.message {
  min-width: 0;
}

.subject,
.preview,
.address span,
.user span {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.subject {
  font-weight: 600;
}

.preview,
.address,
.user {
  color: var(--email-scroll-content-color);
  font-size: 13px;
}

.meta {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  gap: 14px;
  min-width: 0;
}

.address {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.time {
  white-space: nowrap;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.user {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.footer {
  display: flex;
  justify-content: center;
  padding: 14px;
  color: var(--secondary-text-color);
}

.empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}
</style>
