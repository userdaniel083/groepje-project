<script setup lang="ts">
interface SharedFile {
    id: string;
    name: string;
    size: number;
    contentType: string;
    uploadedAt: string;
    shareUrl: string;
    downloadUrl: string;
}

const route = useRoute();
const file = ref<SharedFile | null>(null);
const isLoading = ref(false);
const errorMessage = ref("");

const fileId = computed(() => {
    const id = route.query.id;
    return typeof id === "string" ? id : "";
});

function formatBytes(size: number) {
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    if (size < 1024 * 1024 * 1024)
        return `${(size / 1024 / 1024).toFixed(1)} MB`;
    return `${(size / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function formatDate(value: string) {
    return new Date(value).toLocaleString();
}

async function loadFile() {
    file.value = null;
    errorMessage.value = "";

    if (!fileId.value) {
        errorMessage.value = "Missing file id.";
        return;
    }

    isLoading.value = true;

    try {
        file.value = await $fetch<SharedFile>(`/api/files/${fileId.value}`);
    } catch (error) {
        errorMessage.value =
            error instanceof Error ? error.message : "Could not load file.";
    } finally {
        isLoading.value = false;
    }
}

watch(fileId, loadFile, { immediate: true });
</script>

<template>
    <div
        class="mx-auto flex min-h-screen w-full max-w-2xl items-center px-4 py-10 sm:px-6 lg:px-8"
    >
        <UCard class="w-full shadow-sm">
            <div v-if="isLoading" class="text-sm text-gray-500">
                Loading file...
            </div>

            <UAlert
                v-else-if="errorMessage"
                color="error"
                variant="soft"
                title="Could not open this share link"
                :description="errorMessage"
            />

            <div v-else-if="file" class="space-y-4">
                <div class="space-y-1">
                    <h2 class="text-lg font-semibold">{{ file.name }}</h2>
                    <p class="text-sm text-gray-600">
                        {{ formatBytes(file.size) }} · uploaded
                        {{ formatDate(file.uploadedAt) }}
                    </p>
                </div>

                <div class="flex flex-wrap gap-2">
                    <UButton color="primary" :to="file.downloadUrl" external>
                        Download file
                    </UButton>
                    <UButton color="neutral" variant="soft" to="/">
                        Upload another file
                    </UButton>
                </div>
            </div>
        </UCard>
    </div>
</template>
