from django.contrib import admin

from .models import Conversacion, Mensaje


class MensajeEnLinea(admin.TabularInline):
    model = Mensaje
    extra = 0
    fields = ["rol", "contenido", "sin_respuesta", "interrumpida", "creado"]
    readonly_fields = fields
    can_delete = False


@admin.register(Conversacion)
class ConversacionAdmin(admin.ModelAdmin):
    list_display = ["titulo", "coleccion", "actualizada"]
    search_fields = ["titulo", "mensajes__contenido"]
    inlines = [MensajeEnLinea]
