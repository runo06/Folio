from django.contrib import admin

from .models import Coleccion, Documento


@admin.register(Coleccion)
class ColeccionAdmin(admin.ModelAdmin):
    list_display = ["nombre", "propietario", "creada"]
    search_fields = ["nombre", "propietario__email"]


@admin.register(Documento)
class DocumentoAdmin(admin.ModelAdmin):
    list_display = ["nombre_original", "coleccion", "num_paginas", "estado", "subido"]
    list_filter = ["estado"]
    search_fields = ["nombre_original"]
