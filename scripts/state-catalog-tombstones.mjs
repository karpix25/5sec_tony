export async function deleteCatalogTombstones(query, appStateKey, state) {
  for (const projectId of uniqueIds(state?.deletedProjectIds)) {
    await query("delete from studio_projects where app_state_key = $1 and id = $2", [appStateKey, projectId]);
  }
  for (const productId of uniqueIds(state?.deletedProductIds)) {
    await query("delete from studio_products where app_state_key = $1 and id = $2", [appStateKey, productId]);
  }
}

function uniqueIds(value) {
  return [...new Set(Array.isArray(value) ? value.filter(Boolean) : [])];
}
