function asString(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function resolveRequestActor(req) {
    const fromUserInitials = asString(req?.user?.initials).toUpperCase();
    const fromBodyInitials = asString(req?.body?.initials).toUpperCase();
    const fromQueryInitials = asString(req?.query?.initials).toUpperCase();
    const fromHeaderInitials = asString(req?.headers?.['x-helix-initials']).toUpperCase();

    const initials = fromUserInitials || fromBodyInitials || fromQueryInitials || fromHeaderInitials;
    if (initials) return initials;

    const fromUserEmail = asString(req?.user?.email).toLowerCase();
    const fromBodyEmail = asString(req?.body?.email).toLowerCase();
    const fromQueryEmail = asString(req?.query?.email).toLowerCase();
    const fromHeaderEmail = asString(req?.headers?.['x-user-email']).toLowerCase();
    const fromPrincipal = asString(req?.headers?.['x-ms-client-principal-name']).toLowerCase();

    return fromUserEmail || fromBodyEmail || fromQueryEmail || fromHeaderEmail || fromPrincipal || 'unknown';
}

module.exports = { resolveRequestActor };
