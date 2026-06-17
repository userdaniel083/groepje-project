<template>
    <UApp>
        <NuxtLink to="/">
            <div class="fixed left-5 top-5 z-10">
                <NuxtImg src="/img/logo.svg" class="h-7" />
            </div>
        </NuxtLink>
        <div class="flex flex-col justify-center h-full fixed w-full">
            <div
                class="flex flex-row items-center align-middle justify-center w-full"
            >
                <NuxtPage />
            </div>
        </div>
        <div
            class="fixed bottom-0 right-0 w-full h-full -z-1 bg-linear-to-br from-transparent from-70% to-green-400/40"
        />
    </UApp>
</template>
