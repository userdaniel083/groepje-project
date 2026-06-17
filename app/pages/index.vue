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

const selectedFile = ref<File | null>(null);
const isUploading = ref(false);
const errorMessage = ref("");
const uploadedFile = ref<SharedFile | null>(null);

const { data: files, refresh } = await useFetch<SharedFile[]>("/api/files", {
    default: () => [],
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

function getShareLink(file: SharedFile) {
    if (!import.meta.client) {
        return file.shareUrl;
    }

    return `${window.location.origin}${file.shareUrl}`;
}

async function copyShareLink(file: SharedFile) {
    if (!import.meta.client) return;
    await navigator.clipboard.writeText(getShareLink(file));
}

async function uploadFile() {
    if (!selectedFile.value) return;

    errorMessage.value = "";
    isUploading.value = true;

    try {
        const formData = new FormData();
        formData.append("file", selectedFile.value);

        uploadedFile.value = await $fetch<SharedFile>("/api/files", {
            method: "POST",
            body: formData,
        });

        selectedFile.value = null;
        await refresh();
    } catch (error) {
        errorMessage.value =
            error instanceof Error ? error.message : "Upload failed.";
    } finally {
        isUploading.value = false;
    }
}
</script>

<template>
    <div
        class="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 px-4 py-10 sm:px-6 lg:px-8"
    >
        <UCard class="shadow-sm">
            <div class="space-y-4">
                <UFileUpload
                    v-model="selectedFile"
                    label="Pick a file"
                    description="Drop one file here or click to browse"
                    class="w-full"
                    :disabled="isUploading"
                />

                <div class="flex flex-wrap items-center gap-3">
                    <UButton
                        color="primary"
                        :loading="isUploading"
                        :disabled="!selectedFile"
                        @click="uploadFile"
                    >
                        Upload file
                    </UButton>

                    <span v-if="selectedFile" class="text-sm text-gray-600">
                        {{ selectedFile.name }} ·
                        {{ formatBytes(selectedFile.size) }}
                    </span>
                </div>

                <UAlert
                    v-if="errorMessage"
                    color="error"
                    variant="soft"
                    title="Upload failed"
                    :description="errorMessage"
                />

                <UAlert
                    v-if="uploadedFile"
                    color="success"
                    variant="soft"
                    title="File uploaded"
                >
                    <template #description>
                        <div class="flex flex-col gap-3">
                            <NuxtLink
                                :to="uploadedFile.shareUrl"
                                class="break-all text-sm underline"
                            >
                                {{ getShareLink(uploadedFile) }}
                            </NuxtLink>

                            <div class="flex flex-wrap gap-2">
                                <UButton
                                    size="sm"
                                    color="success"
                                    variant="soft"
                                    @click="copyShareLink(uploadedFile)"
                                >
                                    Copy link
                                </UButton>
                                <UButton
                                    size="sm"
                                    color="neutral"
                                    variant="soft"
                                    :to="uploadedFile.shareUrl"
                                >
                                    Open share page
                                </UButton>
                            </div>
                        </div>
                    </template>
                </UAlert>
            </div>
        </UCard>

        <UCard class="shadow-sm">
            <template #header>
                <div class="flex items-center justify-between gap-3">
                    <div>
                        <h2 class="text-lg font-semibold">Recent uploads</h2>
                        <p class="text-sm text-gray-600">
                            Everything currently stored on this server.
                        </p>
                    </div>
                    <UButton color="neutral" variant="ghost" @click="refresh()"
                        >Refresh</UButton
                    >
                </div>
            </template>

            <div v-if="!files?.length" class="text-sm text-gray-500">
                Nothing uploaded yet.
            </div>

            <div v-else class="space-y-3">
                <div
                    v-for="file in files"
                    :key="file.id"
                    class="flex flex-col gap-3 rounded-lg border border-gray-700 bg-gray-800/70 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                    <div class="min-w-0">
                        <p class="truncate font-medium">{{ file.name }}</p>
                        <p class="text-sm text-gray-600">
                            {{ formatBytes(file.size) }} ·
                            {{ formatDate(file.uploadedAt) }}
                        </p>
                    </div>

                    <div class="flex flex-wrap gap-2">
                        <UButton
                            size="sm"
                            color="neutral"
                            variant="soft"
                            :to="file.shareUrl"
                        >
                            Share page
                        </UButton>
                        <UButton
                            size="sm"
                            color="primary"
                            :to="file.downloadUrl"
                            external
                        >
                            Download
                        </UButton>
                    </div>
                </div>
            </div>
        </UCard>
    </div>
</template>
