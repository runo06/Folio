from django.contrib import admin

from .models import Fragmento


@admin.register(Fragmento)
class FragmentoAdmin(admin.ModelAdmin):
    list_display = ["documento", "pagina", "orden", "inicio_del_texto", "modelo_embedding"]
    list_filter = ["modelo_embedding"]
    search_fields = ["texto", "documento__nombre_original"]
    list_select_related = ["documento"]
    # El embedding son 768 números: no tiene sentido editarlo a mano
    exclude = ["embedding"]
    readonly_fields = ["documento", "pagina", "orden", "texto", "modelo_embedding", "dimensiones"]

    @admin.display(description="texto")
    def inicio_del_texto(self, fragmento):
        return fragmento.texto[:90] + ("…" if len(fragmento.texto) > 90 else "")

    @admin.display(description="dimensiones del vector")
    def dimensiones(self, fragmento):
        return len(fragmento.embedding)

    def has_add_permission(self, request):
        return False
